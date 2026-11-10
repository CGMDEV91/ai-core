import { Button } from "./Button"
import { useCounter } from "./useCounter"

export function App() {
  const { count, inc } = useCounter()
  return (
    <div>
      <Button label={String(count)} onClick={inc} />
    </div>
  )
}
