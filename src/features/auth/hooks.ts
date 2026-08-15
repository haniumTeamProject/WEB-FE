import { useMutation } from '@tanstack/react-query'
import { login, signup } from './api'

export function useLogin() {
  return useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.setItem('adminEmail', data.email)
      localStorage.setItem('adminName', data.name)
      localStorage.setItem('adminRole', data.role)
    },
  })
}

export function useSignup() {
  return useMutation({ mutationFn: signup })
}
