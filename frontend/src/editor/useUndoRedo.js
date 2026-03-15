import { useCallback, useRef, useState } from 'react'

export function useUndoRedo(initial) {
  const [state, setState] = useState(initial)
  const undoStack = useRef([])
  const redoStack = useRef([])

  const push = useCallback((newState) => {
    setState((prev) => {
      undoStack.current.push(prev)
      redoStack.current = []
      return newState
    })
  }, [])

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return
    setState((prev) => {
      redoStack.current.push(prev)
      return undoStack.current.pop()
    })
  }, [])

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return
    setState((prev) => {
      undoStack.current.push(prev)
      return redoStack.current.pop()
    })
  }, [])

  const reset = useCallback((newState) => {
    undoStack.current = []
    redoStack.current = []
    setState(newState)
  }, [])

  return {
    state,
    push,
    undo,
    redo,
    reset,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  }
}
