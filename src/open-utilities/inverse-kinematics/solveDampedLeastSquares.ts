import { coerceBetween } from "../maths/coerceBetween.js";

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
	perturbParameter(state: State, parameter: Parameter, delta: number): number;
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
		const step = solveDampedLeastSquaresStep(jacobian, currentMetrics.errorVector, damping);
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
	const jacobian = Array.from({ length: rows }, () => Array(parameters.length).fill(0));

	for (let column = 0; column < parameters.length; column++) {
		const forwardState = problem.cloneState(state);
		const backwardState = problem.cloneState(state);
		const parameter = parameters[column]!;
		const forwardDelta = problem.perturbParameter(forwardState, parameter, finiteDifference);
		const backwardDelta = problem.perturbParameter(backwardState, parameter, -finiteDifference);

		let sampledMetrics: Metrics | undefined;
		let denominator = 0;

		if (Math.abs(forwardDelta) > EPSILON && Math.abs(backwardDelta) > EPSILON) {
			const forwardMetrics = problem.evaluateState(forwardState);
			const backwardMetrics = problem.evaluateState(backwardState);

			for (let row = 0; row < rows; row++) {
				jacobian[row]![column] = (forwardMetrics.errorVector[row]! - backwardMetrics.errorVector[row]!) / (forwardDelta - backwardDelta);
			}

			continue;
		}

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
			jacobian[row]![column] = (sampledMetrics.errorVector[row]! - baseMetrics.errorVector[row]!) / denominator;
		}
	}

	return jacobian;
}

function solveDampedLeastSquaresStep(jacobian: number[][], errorVector: number[], damping: number) {
	const columnCount = jacobian[0]?.length ?? 0;
	if (columnCount === 0) {
		return undefined;
	}

	const normalMatrix = Array.from({ length: columnCount }, () => Array(columnCount).fill(0));
	const rhs = Array(columnCount).fill(0);
	const dampingSquared = damping * damping;

	for (let row = 0; row < jacobian.length; row++) {
		for (let column = 0; column < columnCount; column++) {
			const left = jacobian[row]![column]!;
			rhs[column] -= left * errorVector[row]!;

			for (let innerColumn = 0; innerColumn < columnCount; innerColumn++) {
				normalMatrix[column]![innerColumn] += left * jacobian[row]![innerColumn]!;
			}
		}
	}

	for (let index = 0; index < columnCount; index++) {
		normalMatrix[index]![index] += dampingSquared;
	}

	return solveLinearSystem(normalMatrix, rhs);
}

function solveLinearSystem(matrix: number[][], rhs: number[]) {
	const size = rhs.length;
	const augmented = matrix.map((row, index) => [...row, rhs[index]!]);

	for (let pivot = 0; pivot < size; pivot++) {
		let pivotRow = pivot;
		for (let row = pivot + 1; row < size; row++) {
			if (Math.abs(augmented[row]![pivot]!) > Math.abs(augmented[pivotRow]![pivot]!)) {
				pivotRow = row;
			}
		}

		if (Math.abs(augmented[pivotRow]![pivot]!) <= EPSILON) {
			return undefined;
		}

		if (pivotRow !== pivot) {
			[augmented[pivot]!, augmented[pivotRow]!] = [augmented[pivotRow]!, augmented[pivot]!];
		}

		const pivotValues = augmented[pivot]!;
		const pivotValue = pivotValues[pivot]!;
		for (let column = pivot; column <= size; column++) {
			pivotValues[column] = pivotValues[column]! / pivotValue;
		}

		for (let row = 0; row < size; row++) {
			if (row === pivot) {
				continue;
			}

			const currentRow = augmented[row]!;
			const factor = currentRow[pivot]!;
			if (Math.abs(factor) <= EPSILON) {
				continue;
			}

			for (let column = pivot; column <= size; column++) {
				currentRow[column] = currentRow[column]! - factor * pivotValues[column]!;
			}
		}
	}

	return augmented.map(row => row[size]!);
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