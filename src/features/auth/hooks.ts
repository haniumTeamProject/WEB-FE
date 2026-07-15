import { useMutation } from '@tanstack/react-query'
import { login, signup } from './api'

export function useLogin() {
  return useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      localStorage.setItem('accessToken', data.accessToken)
    },
  })
}

export function useSignup() {
  return useMutation({ mutationFn: signup })
}
