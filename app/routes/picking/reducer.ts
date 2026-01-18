type Action =
  | { type: "inc" }
  | { type: "dec" }
  | { type: "set"; value: number }
  | { type: "reset" };

export const initial = 1;

export function reducer(state: number, action: Action): number {
  switch (action.type) {
    case "inc":
      return state + 1;
    case "dec":
      return Math.max(1, state - 1);
    case "set":
      return Math.max(1, action.value);
    case "reset":
      return initial;
    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}