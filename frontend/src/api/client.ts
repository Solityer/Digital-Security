import axios from 'axios'

export interface ClientError extends Error {
  status?: number
  url?: string
  method?: string
  detail?: unknown
  response?: unknown
}

const client = axios.create({
  baseURL: '',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

client.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => Promise.reject(error)
)

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const url = error.config?.url
    const method = String(error.config?.method ?? 'GET').toUpperCase()
    const detail = error.response?.data?.detail ?? error.response?.data ?? error.message
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      '请求失败，请稍后重试'
    const wrapped = new Error(message) as ClientError
    wrapped.status = status
    wrapped.url = url
    wrapped.method = method
    wrapped.detail = detail
    wrapped.response = error.response
    console.error('接口请求失败', {
      状态码: status ?? '无',
      方法: method,
      地址: url ?? '未知',
      详情: detail,
    })
    return Promise.reject(wrapped)
  }
)

export default client
