'use client'

import React, { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastMessage {
  id: string
  type: ToastType
  title: string
  message: string
  duration?: number
}

interface ToastProps {
  toast: ToastMessage
  onDismiss: (id: string) => void
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss()
    }, toast.duration || 5000)

    return () => clearTimeout(timer)
  }, [toast.duration])

  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(() => {
      setIsVisible(false)
      onDismiss(toast.id)
    }, 300) // Animation duration
  }

  if (!isVisible) return null

  const getToastStyles = () => {
    const baseStyles =
      'flex items-start p-4 rounded-lg shadow-lg border transition-all duration-300 transform'
    const exitStyles = isExiting
      ? 'opacity-0 translate-x-full'
      : 'opacity-100 translate-x-0'

    switch (toast.type) {
      case 'success':
        return `${baseStyles} ${exitStyles} bg-green-50 border-green-200 text-green-800`
      case 'error':
        return `${baseStyles} ${exitStyles} bg-red-50 border-red-200 text-red-800`
      case 'warning':
        return `${baseStyles} ${exitStyles} bg-yellow-50 border-yellow-200 text-yellow-800`
      case 'info':
        return `${baseStyles} ${exitStyles} bg-blue-50 border-blue-200 text-blue-800`
      default:
        return `${baseStyles} ${exitStyles} bg-gray-50 border-gray-200 text-gray-800`
    }
  }

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <span className="text-green-500 text-lg">✅</span>
      case 'error':
        return <span className="text-red-500 text-lg">❌</span>
      case 'warning':
        return <span className="text-yellow-500 text-lg">⚠️</span>
      case 'info':
        return <span className="text-blue-500 text-lg">ℹ️</span>
      default:
        return null
    }
  }

  return (
    <div className={getToastStyles()}>
      <div className="flex-shrink-0">{getIcon()}</div>
      <div className="ml-3 flex-1">
        <h4 className="text-sm font-medium">{toast.title}</h4>
        <p className="text-sm mt-1 opacity-90">{toast.message}</p>
      </div>
      <div className="ml-4 flex-shrink-0">
        <button
          onClick={handleDismiss}
          className="inline-flex text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600 transition-colors"
        >
          <span className="text-sm">✕</span>
        </button>
      </div>
    </div>
  )
}

// Toast Container component
interface ToastContainerProps {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
