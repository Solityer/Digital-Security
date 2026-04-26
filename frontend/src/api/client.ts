import axios from 'axios'

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
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      '请求失败，请稍后重试'
    console.error('[API Error]', message, error)
    return Promise.reject(new Error(message))
  }
)

export default client
