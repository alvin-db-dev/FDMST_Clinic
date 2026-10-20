import { io } from 'socket.io-client'
import { SOCKET_BASE_URL, authStorage } from '../api/fdmstApi.js'

let socket

export function getChatSocket() {
  const token = authStorage.getToken()
  if (!token) return null

  if (!socket || socket.auth?.token !== token) {
    if (socket) socket.disconnect()
    socket = io(SOCKET_BASE_URL, {
      auth: { token },
      autoConnect: true,
      transports: ['websocket', 'polling'],
    })
  }

  return socket
}

export function closeChatSocket() {
  if (socket) socket.disconnect()
  socket = null
}
