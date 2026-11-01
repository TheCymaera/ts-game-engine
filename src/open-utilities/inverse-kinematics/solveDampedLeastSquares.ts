import { coerceBetween } from "../maths/coerceBetween.js";
import { MatrixN } from "../maths/MatrixN.js";

const EPSILON = 0.000001;

export interface DampedLeastSquaresOptions {
	iterations: number;
	damping: number;
	minDamping: number;
	maxDamping: number;
	dampingScale: number;
	finiteDifference: number;
	maxStep: number;
	minStepScale: number;
}

export interface DampedLeastSquaresMetrics {
	errorVector: number[];
	score: number;
	isSolved: boolean;
}

export interface LeastSquaresProblem<State, Parameter, Metrics extends DampedLeastSquaresMetrics> {
	cloneState(state: State): State;
	copyState(target: State, source: State): void;
	evaluateState(state: State): Metrics;
	listParameters(state: State): Parameter[];

	/** Applies `delta` to `parameter`, returning the delta actually applied after clamping. */
	perturbParameter(state: State, parameter: Parameter, delta: number): number;

	/** Returns the delta that perturbParameter would apply, i.e. `delta` clipped to the parameter's range. */
	clampDelta(state: State, parameter: Parameter, delta: number): number;

	applyStep(state: State, parameters: Parameter[], step: number[], scale: number): void;
}

export function solveDampedLeastSquares<State, Parameter, Metrics extends DampedLeastSquaresMetrics>(
	state: State,
	problem: LeastSquaresProblem<State, Parameter, Metrics>,
	options: DampedLeastSquaresOptions,
) {
	let currentMetrics = problem.evaluateState(state);
	let bestState = problem.cloneState(state);
	let bestMetrics = currentMetrics;
	let damping = coerceBetween(options.damping, options.minDamping, options.maxDamping);

	for (let iteration = 0; iteration < options.iterations; iteration++) {
		if (currentMetrics.isSolved) {
			break;
		}

		const parameters = problem.listParameters(state);
		if (parameters.length === 0) {
			break;
		}

		const jacobian = computeJacobian(problem, state, currentMetrics, parameters, options.finiteDifference);
		const step = solveDampedLeastSquaresStep(problem, state, parameters, jacobian, currentMetrics.errorVector, damping);
		if (!step) {
			damping = Math.min(options.maxDamping, damping * options.dampingScale);
			continue;
		}

		limitStepMagnitude(step, options.maxStep);

		let accepted = false;
		for (let stepScale = 1; stepScale >= options.minStepScale; stepScale *= 0.5) {
			const trialState = problem.cloneState(state);
			problem.applyStep(trialState, parameters, step, stepScale);

			const trialMetrics = problem.evaluateState(trialState);
			if (trialMetrics.score >= currentMetrics.score - EPSILON) {
				continue;
			}

			problem.copyState(state, trialState);
			currentMetrics = trialMetrics;
			accepted = true;

			if (trialMetrics.score < bestMetrics.score - EPSILON) {
				bestState = problem.cloneState(trialState);
				bestMetrics = trialMetrics;
			}

			damping = Math.max(options.minDamping, damping / options.dampingScale);
			break;
		}

		if (!accepted) {
			damping = Math.min(options.maxDamping, damping * options.dampingScale);
		}
	}

	problem.copyState(state, bestState);
	return bestMetrics;
}

function computeJacobian<State, Parameter, Metrics extends DampedLeastSquaresMetrics>(
	problem: LeastSquaresProblem<State, Parameter, Metrics>,
	state: State,
	baseMetrics: Metrics,
	parameters: Parameter[],
	finiteDifference: number,
) {
	const rows = baseMetrics.errorVector.length;
	const jacobian = MatrixN.zero(rows, parameters.length);

	for (let column = 0; column < parameters.length; column++) {
		const forwardState = problem.cloneState(state);
		const backwardState = problem.cloneState(state);
		const parameter = parameters[column]!;
		const forwardDelta = problem.perturbParameter(forwardState, parameter, finiteDifference);
		const backwardDelta = problem.perturbParameter(backwardState, parameter, -finiteDifference);

		if (Math.abs(forwardDelta) > EPSILON && Math.abs(backwardDelta) > EPSILON) {
			const forwardMetrics = problem.evaluateState(forwardState);
			const backwardMetrics = problem.evaluateState(backwardState);

			for (let row = 0; row < rows; row++) {
				jacobian.set(row, column, (forwardMetrics.errorVector[row]! - backwardMetrics.errorVector[row]!) / (forwardDelta - backwardDelta));
			}

			continue;
		}

		let sampledMetrics: Metrics | undefined;
		let denominator = 0;

		if (Math.abs(forwardDelta) > EPSILON) {
			sampledMetrics = problem.evaluateState(forwardState);
			denominator = forwardDelta;
		} else if (Math.abs(backwardDelta) > EPSILON) {
			sampledMetrics = problem.evaluateState(backwardState);
			denominator = backwardDelta;
		}

		if (!sampledMetrics || Math.abs(denominator) <= EPSILON) {
			continue;
		}

		for (let row = 0; row < rows; row++) {
			jacobian.set(row, column, (sampledMetrics.errorVector[row]! - baseMetrics.errorVector[row]!) / denominator);
		}
	}

	return jacobian;
}

function solveDampedLeastSquaresStep<State, Parameter, Metrics extends DampedLeastSquaresMetrics>(
	problem: LeastSquaresProblem<State, Parameter, Metrics>,
	state: State,
	parameters: Parameter[],
	jacobian: MatrixN,
	errorVector: number[],
	damping: number,
) {
	const columnCount = parameters.length;
	if (columnCount === 0) {
		return undefined;
	}

	const active = Array.from({ length: columnCount }, () => true);

	while (true) {
		const step = solveRestrictedStep(jacobian, errorVector, damping, active);
		if (!step) {
			return undefined;
		}

		let pinned = false;

		for (let index = 0; index < columnCount; index++) {
			if (!active[index]) {
				continue;
			}

			const delta = step[index]!;
			if (Math.abs(delta) <= EPSILON) {
				continue;
			}

			const applied = problem.clampDelta(state, parameters[index]!, delta);
			step[index] = applied;

			if (Math.abs(applied) <= EPSILON) {
				active[index] = false;
				pinned = true;
			}
		}

		if (!pinned) {
			return step;
		}

		if (!active.some(value => value)) {
			return undefined;
		}
	}
}

function solveRestrictedStep(jacobian: MatrixN, errorVector: number[], damping: number, active: boolean[]) {
	const columns: number[] = [];
	for (let index = 0; index < active.length; index++) {
		if (active[index]) columns.push(index);
	}
	if (columns.length === 0) return undefined;

	const restricted = jacobian.selectColumns(columns);
	const normalMatrix = restricted.transposeMultiply(restricted);
	normalMatrix.addDiagonal(damping * damping);

	const rhs = restricted.transposeMultiplyVector(errorVector).map(value => -value);
	const solution = solveLinearSystem(normalMatrix, rhs);
	if (!solution) return undefined;

	const step = Array.from({ length: active.length }, () => 0);
	for (let index = 0; index < columns.length; index++) {
		if (!Number.isFinite(solution[index])) return undefined;
		step[columns[index]!] = solution[index]!;
	}

	return step;
}

/**
 * Gauss–Jordan elimination with partial pivoting.
 * Solves `matrix * x = rhs`
 */
function solveLinearSystem(matrix: MatrixN, rhs: readonly number[]) {
	const size = matrix.rows;
	const augmented = matrix.clone();
	const solution = [...rhs];

	for (let pivot = 0; pivot < size; pivot++) {
		let pivotRow = pivot;
		for (let row = pivot + 1; row < size; row++) {
			if (Math.abs(augmented.get(row, pivot)!) > Math.abs(augmented.get(pivotRow, pivot)!)) {
				pivotRow = row;
			}
		}

		if (Math.abs(augmented.get(pivotRow, pivot)!) <= EPSILON) {
			return undefined;
		}

		if (pivotRow !== pivot) {
			for (let col = pivot; col < size; col++) {
				const i1 = augmented.index(pivot, col);
				const i2 = augmented.index(pivotRow, col);
				[augmented.values[i1]!, augmented.values[i2]!] = [augmented.values[i2]!, augmented.values[i1]!];
			}

			[solution[pivot], solution[pivotRow]] = [solution[pivotRow]!, solution[pivot]!];
		}

		const pivotValue = augmented.get(pivot, pivot)!;
		for (let col = pivot; col < size; col++) {
			augmented.values[augmented.index(pivot, col)]! /= pivotValue;
		}
		solution[pivot]! /= pivotValue;

		for (let row = 0; row < size; row++) {
			if (row === pivot) {
				continue;
			}

			const factor = augmented.get(row, pivot)!;
			if (Math.abs(factor) <= EPSILON) {
				continue;
			}

			for (let col = pivot; col < size; col++) {
				augmented.values[augmented.index(row, col)]! -= factor * augmented.get(pivot, col)!;
			}
			solution[row]! -= factor * solution[pivot]!;
		}
	}

	return solution;
}

function limitStepMagnitude(step: number[], maxStep: number) {
	let maxMagnitude = 0;
	for (const value of step) {
		maxMagnitude = Math.max(maxMagnitude, Math.abs(value));
	}

	if (maxMagnitude <= maxStep || maxMagnitude <= EPSILON) {
		return;
	}

	const scale = maxStep / maxMagnitude;
	for (let index = 0; index < step.length; index++) {
		step[index]! *= scale;
	}
}