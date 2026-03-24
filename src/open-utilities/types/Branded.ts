declare const symbol: unique symbol;

export type Branded<T, B> = T & { [symbol]: B };