export class MatrixN {
	private constructor(
		readonly rows: number,
		readonly cols: number,
		readonly values: Float64Array,
	) {}

	static new(rows: number, cols: number, values?: ArrayLike<number>) {
		if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 0 || cols < 0) {
			throw new Error("MatrixN dimensions must be non-negative integers.");
		}

		const length = rows * cols;
		if (values && values.length !== length) {
			throw new Error(`MatrixN expected ${length} values but received ${values.length}.`);
		}

		return new MatrixN(rows, cols, values ? Float64Array.from(values) : new Float64Array(length));
	}

	static zero(rows: number, cols: number) {
		return MatrixN.new(rows, cols);
	}

	static identity(size: number) {
		const matrix = MatrixN.zero(size, size);
		for (let index = 0; index < size; index++) {
			matrix.values[index * size + index] = 1;
		}
		return matrix;
	}

	static fromRows(rows: readonly (readonly number[])[]) {
		const rowCount = rows.length;
		const colCount = rows[0]?.length ?? 0;
		const matrix = MatrixN.zero(rowCount, colCount);

		for (let row = 0; row < rowCount; row++) {
			const values = rows[row]!;
			if (values.length !== colCount) {
				throw new Error("MatrixN rows must all have the same length.");
			}

			for (let col = 0; col < colCount; col++) {
				matrix.values[row * colCount + col] = values[col]!;
			}
		}

		return matrix;
	}

	index(row: number, col: number) {
		return row * this.cols + col;
	}

	get(row: number, col: number) {
		return this.values[this.index(row, col)];
	}

	set(row: number, col: number, value: number) {
		this.values[this.index(row, col)] = value;
		return this;
	}

	clone() {
		return new MatrixN(this.rows, this.cols, this.values.slice());
	}

	copy(other: MatrixN) {
		if (this.rows !== other.rows || this.cols !== other.cols) {
			throw new Error("MatrixN dimensions do not match.");
		}

		this.values.set(other.values);
		return this;
	}

	transpose() {
		const result = MatrixN.zero(this.cols, this.rows);
		for (let row = 0; row < this.rows; row++) {
			for (let col = 0; col < this.cols; col++) {
				result.values[result.index(col, row)] = this.values[this.index(row, col)]!;
			}
		}
		return result;
	}

	multiply(other: MatrixN) {
		if (this.cols !== other.rows) {
			throw new Error("MatrixN dimensions do not match.");
		}

		const result = MatrixN.zero(this.rows, other.cols);
		for (let row = 0; row < this.rows; row++) {
			for (let col = 0; col < other.cols; col++) {
				let sum = 0;
				for (let inner = 0; inner < this.cols; inner++) {
					sum += this.values[this.index(row, inner)]! * other.values[other.index(inner, col)]!;
				}
				result.values[result.index(row, col)] = sum;
			}
		}
		return result;
	}

	transposeMultiply(other: MatrixN) {
		if (this.rows !== other.rows) {
			throw new Error("MatrixN dimensions do not match.");
		}

		const result = MatrixN.zero(this.cols, other.cols);
		for (let row = 0; row < this.rows; row++) {
			for (let leftCol = 0; leftCol < this.cols; leftCol++) {
				const left = this.values[this.index(row, leftCol)]!;
				for (let rightCol = 0; rightCol < other.cols; rightCol++) {
					result.values[result.index(leftCol, rightCol)]! += left * other.values[other.index(row, rightCol)]!;
				}
			}
		}
		return result;
	}

	transposeMultiplyVector(vector: readonly number[]) {
		if (vector.length !== this.rows) {
			throw new Error("MatrixN vector length does not match the row count.");
		}

		const result = Array.from({ length: this.cols }, () => 0);
		for (let row = 0; row < this.rows; row++) {
			const value = vector[row]!;
			for (let col = 0; col < this.cols; col++) {
				result[col]! += this.values[this.index(row, col)]! * value;
			}
		}
		return result;
	}

	addDiagonal(value: number) {
		const size = Math.min(this.rows, this.cols);
		for (let index = 0; index < size; index++) {
			this.values[this.index(index, index)]! += value;
		}
		return this;
	}

	selectColumns(indices: readonly number[]) {
		const result = MatrixN.zero(this.rows, indices.length);
		for (let row = 0; row < this.rows; row++) {
			for (let col = 0; col < indices.length; col++) {
				result.values[result.index(row, col)] = this.values[this.index(row, indices[col]!)]!;
			}
		}
		return result;
	}
}
