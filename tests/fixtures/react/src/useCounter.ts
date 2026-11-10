import { useState } from "react"

export function useCounter() {
  const [count, set] = useState(0)
  return { count, inc: () => set(count + 1) }
}
