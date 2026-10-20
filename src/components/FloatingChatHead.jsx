import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FaArchive, FaCheckDouble, FaCircle, FaComments, FaFileAlt, FaMinus, FaPaperclip, FaPaperPlane, FaSearch, FaTimes, FaTrash, FaUndo, FaUserMd } from 'react-icons/fa'
import { authStorage, fdmstApi } from '../api/fdmstApi.js'
import { useToast } from '../context/ToastContext.jsx'
import { getChatSocket } from '../utils/chatSocket.js'
import { uploadChatFile } from '../utils/imageUpload.js'

function initials(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'FD'
}

function displayName(user) {
  return user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'FDMST User'
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const sameDay = date.toDateString() === new Date().toDateString()
  return date.toLocaleString('en-PH', sameDay ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' })
}

function isAuthError(error) {
  return error?.status === 401 || error?.status === 403
}

function Avatar({ user, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'h-10 w-10 text-xs' : size === 'lg' ? 'h-14 w-14 text-base' : 'h-12 w-12 text-sm'

  if (user?.profilePhoto) {
    return <img src={user.profilePhoto} alt="" className={`${sizeClass} rounded-full object-cover ring-2 ring-white shadow-sm`} />
  }

  return (
    <span className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-sky-950 font-bold text-amber-400 ring-2 ring-white shadow-sm`}>
      {initials(user)}
    </span>
  )
}

function ConversationButton({ conversation, active, onClick }) {
  const otherUser = conversation.otherUser

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-sky-50 ${active ? 'bg-sky-50 ring-1 ring-sky-100' : ''}`}
    >
      <div className="relative">
        <Avatar user={otherUser} size="sm" />
        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${otherUser?.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-sky-950">{displayName(otherUser)}</p>
          <span className="shrink-0 text-[11px] font-semibold text-slate-400">{formatTime(conversation.lastMessageAt)}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <p className="truncate text-xs text-slate-500">{conversation.lastMessage || 'No messages yet.'}</p>
          {conversation.unreadCount > 0 ? (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
              {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}

function MessageBubble({ message, previousMessage, currentUserId, onDelete }) {
  const mine = String(message.sender) === String(currentUserId)
  const grouped = previousMessage && String(previousMessage.sender) === String(message.sender)
  const isImage = String(message.attachment?.type || '').startsWith('image/')

  return (
    <div className={`group flex items-center gap-2 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-4'}`}>
      {mine ? <button type="button" onClick={() => onDelete(message)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-300 opacity-60 transition hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100" title="Delete message" aria-label="Delete message"><FaTrash className="h-3.5 w-3.5" /></button> : null}
      <div className={`max-w-[82%] rounded-2xl px-4 py-2 shadow-sm ${mine ? 'rounded-br-md bg-sky-950 text-white' : 'rounded-bl-md bg-white text-slate-700 ring-1 ring-slate-100'}`}>
        {message.attachment ? (
          isImage && message.attachment.url ? (
            <a href={message.attachment.url} target="_blank" rel="noreferrer" className="mb-2 block overflow-hidden rounded-xl">
              <img src={message.attachment.url} alt={message.attachment.filename || 'Message attachment'} className="max-h-52 w-full object-cover" />
            </a>
          ) : (
            <a href={message.attachment.url || undefined} target="_blank" rel="noreferrer" className={`mb-2 flex min-w-0 items-center gap-3 rounded-xl p-3 ${mine ? 'bg-white/10' : 'bg-slate-50'}`}>
              <FaFileAlt className="shrink-0" />
              <span className="min-w-0 truncate text-xs font-bold">{message.attachment.filename || 'Attachment'}</span>
            </a>
          )
        ) : null}
        {message.content ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p> : null}
        <div className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${mine ? 'text-sky-100' : 'text-slate-400'}`}>
          <span>{formatTime(message.createdAt)}</span>
          {mine ? <FaCheckDouble className={message.deliveryStatus === 'read' ? 'text-emerald-300' : 'text-sky-200'} /> : null}
        </div>
      </div>
      {!mine ? <button type="button" onClick={() => onDelete(message)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-300 opacity-60 transition hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100" title="Delete message" aria-label="Delete message"><FaTrash className="h-3.5 w-3.5" /></button> : null}
    </div>
  )
}

const CHAT_HEAD_SIZE = 64
const CHAT_HEAD_MARGIN = 20
const CHAT_HEAD_DRAG_THRESHOLD = 6
const CHAT_HEAD_POSITION_KEY = 'fdmst.chatHead.position'

function clampChatHeadPosition(position) {
  const maxX = Math.max(CHAT_HEAD_MARGIN, window.innerWidth - CHAT_HEAD_SIZE - CHAT_HEAD_MARGIN)
  const maxY = Math.max(CHAT_HEAD_MARGIN, window.innerHeight - CHAT_HEAD_SIZE - CHAT_HEAD_MARGIN)
  return {
    x: Math.min(Math.max(position.x, CHAT_HEAD_MARGIN), maxX),
    y: Math.min(Math.max(position.y, CHAT_HEAD_MARGIN), maxY),
  }
}

function snapChatHeadToEdge(position) {
  const clamped = clampChatHeadPosition(position)
  const center = clamped.x + CHAT_HEAD_SIZE / 2
  const snapLeft = center < window.innerWidth / 2
  return {
    x: snapLeft ? CHAT_HEAD_MARGIN : window.innerWidth - CHAT_HEAD_SIZE - CHAT_HEAD_MARGIN,
    y: clamped.y,
  }
}

function readStoredChatHeadPosition() {
  try {
    const raw = window.localStorage.getItem(CHAT_HEAD_POSITION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Number.isFinite(parsed?.x) || !Number.isFinite(parsed?.y)) return null
    return snapChatHeadToEdge(parsed)
  } catch {
    return null
  }
}

function useDraggableChatHead(onTap) {
  const [position, setPosition] = useState(() => (typeof window === 'undefined' ? null : readStoredChatHeadPosition()))
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    if (!position) return undefined
    const handleResize = () => setPosition((current) => (current ? snapChatHeadToEdge(current) : current))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [position])

  const handlePointerDown = useCallback((event) => {
    if (event.button !== undefined && event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    dragRef.current = { startX: event.clientX, startY: event.clientY, origin: { x: rect.left, y: rect.top }, moved: false }
    suppressClickRef.current = false
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [])

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current
    if (!drag) return
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (!drag.moved) {
      if (Math.abs(deltaX) < CHAT_HEAD_DRAG_THRESHOLD && Math.abs(deltaY) < CHAT_HEAD_DRAG_THRESHOLD) return
      drag.moved = true
      setIsDragging(true)
    }
    event.preventDefault()
    setPosition(clampChatHeadPosition({ x: drag.origin.x + deltaX, y: drag.origin.y + deltaY }))
  }, [])

  const finishDrag = useCallback((event) => {
    const drag = dragRef.current
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (!drag?.moved) return
    suppressClickRef.current = true
    setIsDragging(false)
    setPosition((current) => {
      if (!current) return current
      const snapped = snapChatHeadToEdge(current)
      try {
        window.localStorage.setItem(CHAT_HEAD_POSITION_KEY, JSON.stringify(snapped))
      } catch {
        // Ignore storage failures; the position still applies for this session.
      }
      return snapped
    })
  }, [])

  const handleClick = useCallback((event) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      event.preventDefault()
      return
    }
    onTap?.(event)
  }, [onTap])

  const style = position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined

  return {
    style,
    isDragging,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
      onClick: handleClick,
    },
  }
}

function MessageToast({ toastData, onOpen, onClose }) {
  if (!toastData) return null

  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-24 right-5 z-[45] flex w-[min(22rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-2xl shadow-slate-900/15 transition hover:-translate-y-0.5 hover:shadow-slate-900/20"
    >
      <Avatar user={toastData.sender} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-sky-950">{displayName(toastData.sender)}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">{toastData.preview}</p>
      </div>
      <span
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onClose()
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Dismiss message preview"
      >
        <FaTimes />
      </span>
    </button>
  )
}

function FloatingChatHead({ requestedConversationId = '', isOpen, onOpen, onClose, onUnreadChange }) {
  const toast = useToast()
  const currentUser = authStorage.getUser()
  const isPatient = currentUser?.role === 'patient'
  const [conversations, setConversations] = useState([])
  const [recipients, setRecipients] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('active')
  const [composer, setComposer] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [isDeletingConversation, setIsDeletingConversation] = useState(false)
  const [pendingAttachment, setPendingAttachment] = useState(null)
  const [messageToast, setMessageToast] = useState(null)
  const messagesEndRef = useRef(null)
  const attachmentInputRef = useRef(null)
  const selectedConversationIdRef = useRef('')
  const isOpenRef = useRef(isOpen)
  const chatHeadDrag = useDraggableChatHead(onOpen)

  const unreadTotal = useMemo(
    () => conversations.reduce((total, conversation) => total + (Number(conversation.unreadCount) || 0), 0),
    [conversations],
  )

  const loadConversations = useCallback(async ({ preserveSelection = true } = {}) => {
    if (!authStorage.isAuthenticated()) {
      setConversations([])
      setIsLoading(false)
      return
    }

    try {
      const response = await fdmstApi.getConversations({ search, status: filter })
      const nextConversations = response.data || []
      setConversations(nextConversations)

      const requestedConversation = requestedConversationId
        ? nextConversations.find((item) => item.id === requestedConversationId)
        : null

      if (requestedConversation) {
        setSelectedConversation(requestedConversation)
      } else if (!preserveSelection) {
        setSelectedConversation(nextConversations[0] || null)
      } else if (!selectedConversationIdRef.current) {
        setSelectedConversation((current) => current || nextConversations[0] || null)
      } else {
        setSelectedConversation((current) => nextConversations.find((item) => item.id === current?.id) || current || nextConversations[0] || null)
      }
    } catch (error) {
      if (isAuthError(error)) {
        setConversations([])
        return
      }
      toast.error(error.message || 'Unable to load conversations.')
      setConversations([])
    } finally {
      setIsLoading(false)
    }
  }, [filter, requestedConversationId, search, toast])

  const loadRecipients = useCallback(async () => {
    if (!authStorage.isAuthenticated()) {
      setRecipients([])
      return
    }

    try {
      const response = await fdmstApi.getMessageRecipients()
      setRecipients(response.data || [])
    } catch {
      setRecipients([])
    }
  }, [])

  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id || ''
  }, [selectedConversation?.id])

  useEffect(() => {
    onUnreadChange?.(unreadTotal)
  }, [onUnreadChange, unreadTotal])

  useEffect(() => {
    Promise.resolve()
      .then(async () => {
        await loadRecipients()
        await loadConversations({ preserveSelection: true })
      })
  }, [loadConversations, loadRecipients])

  useEffect(() => {
    if (requestedConversationId) onOpen?.()
  }, [onOpen, requestedConversationId])

  useEffect(() => {
    const conversationId = selectedConversation?.id
    if (!conversationId) return undefined

    let cancelled = false
    Promise.resolve()
      .then(async () => {
        if (!authStorage.isAuthenticated()) return
        const response = await fdmstApi.getConversationMessages(conversationId)
        if (cancelled) return
        setMessages(response.data || [])
        setSelectedConversation((current) => response.conversation || current)
        if (isOpen) {
          await fdmstApi.markConversationRead(conversationId)
        }
        if (!cancelled && isOpen) {
          setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation))
        }
      })
      .catch((error) => {
        if (isAuthError(error)) return
        if (!cancelled) toast.error(error.message || 'Unable to load messages.')
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, selectedConversation?.id, toast])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isOpen])

  useEffect(() => {
    const socket = getChatSocket()
    if (!socket) return undefined

    const handleNewMessage = ({ conversationId, message, sender }) => {
      const normalizedConversationId = String(conversationId)
      const isSelected = selectedConversationIdRef.current === normalizedConversationId
      const isOwnMessage = String(message.sender) === String(currentUser?.id)
      let knownConversation = null

      setConversations((current) => current.map((conversation) => (
        conversation.id === normalizedConversationId
          ? (knownConversation = conversation, {
              ...conversation,
              lastMessage: message.content || (message.attachment ? 'Attachment' : ''),
              lastMessageAt: message.createdAt,
              unreadCount: isSelected && isOpenRef.current
                ? 0
                : isOwnMessage || conversation.lastMessageAt === message.createdAt
                  ? conversation.unreadCount || 0
                  : (conversation.unreadCount || 0) + 1,
            })
          : conversation
      )).sort((left, right) => new Date(right.lastMessageAt || 0) - new Date(left.lastMessageAt || 0)))

      if (!knownConversation) {
        loadConversations({ preserveSelection: true }).catch(() => {})
      }

      if (isSelected) {
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
        if (isOpenRef.current) fdmstApi.markConversationRead(normalizedConversationId).catch(() => {})
      }

      if (!isOwnMessage && (!isOpenRef.current || !isSelected)) {
        setMessageToast({
          conversationId: normalizedConversationId,
          sender: sender || knownConversation?.otherUser,
          preview: message.content || message.attachment?.filename || 'Attachment',
        })
        window.clearTimeout(window.__fdmstMessageToastTimer)
        window.__fdmstMessageToastTimer = window.setTimeout(() => setMessageToast(null), 5000)
      }
    }

    const handlePresence = ({ userId, isOnline }) => {
      setConversations((current) => current.map((conversation) => (
        conversation.otherUser?.id === userId
          ? { ...conversation, otherUser: { ...conversation.otherUser, isOnline } }
          : conversation
      )))
    }

    const handleDeletedMessage = ({ conversationId, messageId }) => {
      if (selectedConversationIdRef.current === String(conversationId)) {
        setMessages((current) => current.filter((message) => String(message.id) !== String(messageId)))
      }
    }

    const handleArchivedConversation = ({ conversationId }) => {
      if (selectedConversationIdRef.current === String(conversationId)) setSelectedConversation(null)
      loadConversations({ preserveSelection: false }).catch(() => {})
    }

    const handleDeletedConversation = ({ conversationId }) => {
      setConversations((current) => current.filter((conversation) => String(conversation.id) !== String(conversationId)))
      if (selectedConversationIdRef.current === String(conversationId)) {
        setSelectedConversation(null)
        setMessages([])
      }
    }

    socket.on('message:new', handleNewMessage)
    socket.on('message:notification', handleNewMessage)
    socket.on('presence:update', handlePresence)
    socket.on('message:deleted', handleDeletedMessage)
    socket.on('conversation:archived', handleArchivedConversation)
    socket.on('conversation:deleted', handleDeletedConversation)

    return () => {
      socket.off('message:new', handleNewMessage)
      socket.off('message:notification', handleNewMessage)
      socket.off('presence:update', handlePresence)
      socket.off('message:deleted', handleDeletedMessage)
      socket.off('conversation:archived', handleArchivedConversation)
      socket.off('conversation:deleted', handleDeletedConversation)
    }
  }, [currentUser?.id, loadConversations])

  useEffect(() => {
    const socket = getChatSocket()
    if (!socket || !selectedConversation?.id || !isOpen) return undefined
    socket.emit('conversation:join', selectedConversation.id)
    return () => socket.emit('conversation:leave', selectedConversation.id)
  }, [isOpen, selectedConversation?.id])

  const filteredRecipients = useMemo(() => {
    const existingIds = new Set(conversations.map((conversation) => String(conversation.otherUser?.id)))
    return recipients.filter((recipient) => !existingIds.has(String(recipient.id)))
  }, [conversations, recipients])

  const startConversation = async (recipient) => {
    if (!authStorage.isAuthenticated()) return

    try {
      const payload = isPatient ? { clinicUserId: recipient?.id } : { patientId: recipient.id }
      const response = await fdmstApi.startConversation(payload)
      setSelectedConversation(response.conversation)
      await loadConversations({ preserveSelection: true })
      onOpen?.()
    } catch (error) {
      if (isAuthError(error)) return
      toast.error(error.message || 'Unable to open conversation.')
    }
  }

  const sendMessage = async () => {
    const content = composer.trim()
    if ((!content && !pendingAttachment) || !selectedConversation?.id || isSending) return
    if (!authStorage.isAuthenticated()) return

    setComposer('')
    setIsSending(true)
    let uploadedAttachment = null
    try {
      uploadedAttachment = pendingAttachment ? await uploadChatFile(pendingAttachment.file) : null
      const response = await fdmstApi.sendConversationMessage(selectedConversation.id, { content, attachment: uploadedAttachment })
      setMessages((current) => current.some((item) => item.id === response.message.id) ? current : [...current, response.message])
      if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl)
      setPendingAttachment(null)
      await loadConversations({ preserveSelection: true })
    } catch (error) {
      if (uploadedAttachment) await fdmstApi.deleteChatFile(uploadedAttachment).catch(() => {})
      setComposer(content)
      if (isAuthError(error)) return
      toast.error(error.message || 'Unable to send message.')
    } finally {
      setIsSending(false)
    }
  }

  const selectAttachment = (file) => {
    if (!file) return
    const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    if (!acceptedTypes.has(file.type)) {
      toast.error('Choose a JPG, PNG, WebP, or PDF file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Chat attachments must be 5 MB or smaller.')
      return
    }
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl)
    setPendingAttachment({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
    })
  }

  const removePendingAttachment = () => {
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl)
    setPendingAttachment(null)
  }

  const deleteMessage = async (message) => {
    if (!selectedConversation?.id || !window.confirm('Delete this message for you?')) return
    try {
      await fdmstApi.deleteConversationMessage(selectedConversation.id, message.id)
      setMessages((current) => current.filter((item) => item.id !== message.id))
      await loadConversations({ preserveSelection: true })
      toast.success('Message deleted.')
    } catch (error) {
      toast.error(error.message || 'Unable to delete message.')
    }
  }

  const toggleArchive = async () => {
    if (!selectedConversation?.id || isArchiving) return
    const shouldArchive = !selectedConversation.isArchived
    setIsArchiving(true)
    try {
      const response = await fdmstApi.archiveConversation(selectedConversation.id, shouldArchive)
      toast.success(response.message || (shouldArchive ? 'Conversation archived.' : 'Conversation restored.'))
      setSelectedConversation(null)
      await loadConversations({ preserveSelection: false })
    } catch (error) {
      toast.error(error.message || 'Unable to update the conversation.')
    } finally {
      setIsArchiving(false)
    }
  }

  const deleteConversation = async () => {
    if (!selectedConversation?.id || isDeletingConversation) return
    if (!window.confirm('Delete this conversation and its past messages for you? The other participant will keep their copy.')) return

    const conversationId = selectedConversation.id
    setIsDeletingConversation(true)
    try {
      await fdmstApi.deleteConversation(conversationId)
      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId))
      setSelectedConversation(null)
      setMessages([])
      toast.success('Conversation deleted.')
    } catch (error) {
      if (!isAuthError(error)) toast.error(error.message || 'Unable to delete conversation.')
    } finally {
      setIsDeletingConversation(false)
    }
  }

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  const openToastConversation = () => {
    const conversation = conversations.find((item) => item.id === messageToast?.conversationId)
    if (conversation) setSelectedConversation(conversation)
    setMessageToast(null)
    onOpen?.()
  }

  const otherUser = selectedConversation?.otherUser

  return (
    <>
      <MessageToast toastData={messageToast} onOpen={openToastConversation} onClose={() => setMessageToast(null)} />

      {isOpen ? (
        <section className="fixed bottom-5 right-5 z-[45] flex h-[min(42rem,calc(100vh-2rem))] w-[min(58rem,calc(100vw-2rem))] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 transition sm:bottom-6 sm:right-6 lg:grid lg:grid-cols-[20rem_1fr]">
          <aside className="hidden min-h-0 flex-col border-r border-slate-200 bg-white lg:flex">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-sky-950">Messages</p>
                  <p className="text-xs font-medium text-slate-500">Secure clinic chat</p>
                </div>
              </div>
              <div className="relative mt-4">
                <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={isPatient ? 'Search clinic messages...' : 'Search patients...'}
                />
              </div>
              {!isPatient ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {['active', 'unread', 'archived'].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilter(item)}
                      className={`h-9 rounded-xl text-xs font-bold transition ${filter === item ? 'bg-sky-950 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {item.charAt(0).toUpperCase() + item.slice(1)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
              {isLoading ? <p className="p-4 text-sm text-slate-500">Loading conversations...</p> : null}
              {!isLoading && conversations.map((conversation) => (
                <ConversationButton key={conversation.id} conversation={conversation} active={selectedConversation?.id === conversation.id} onClick={() => setSelectedConversation(conversation)} />
              ))}
              {!isLoading && !conversations.length ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">No conversations yet.</div>
              ) : null}
              {filteredRecipients.length ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-slate-400">Start Conversation</p>
                  {filteredRecipients.slice(0, 6).map((recipient) => (
                    <button key={recipient.id} type="button" onClick={() => startConversation(recipient)} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-slate-50">
                      <Avatar user={recipient} size="sm" />
                      <span className="truncate text-sm font-semibold text-sky-950">{displayName(recipient)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col bg-slate-50">
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {selectedConversation ? <Avatar user={otherUser} size="sm" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-950 text-amber-400"><FaComments /></span>}
                <div className="min-w-0">
                  <h2 className="truncate font-bold text-sky-950">{selectedConversation ? displayName(otherUser) : 'Messages'}</h2>
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
                    {selectedConversation ? (
                      <>
                        <FaCircle className={`h-2 w-2 ${otherUser?.isOnline ? 'text-emerald-500' : 'text-slate-300'}`} />
                        {otherUser?.isOnline ? 'Online' : 'Offline'}
                      </>
                    ) : 'Choose a conversation'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-950 sm:inline-flex">
                  <FaUserMd /> Secure chat
                </span>
                {!isPatient && selectedConversation ? (
                  <button type="button" onClick={toggleArchive} disabled={isArchiving} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-sky-50 hover:text-sky-900 disabled:opacity-50" aria-label={selectedConversation.isArchived ? 'Restore conversation' : 'Archive conversation'} title={selectedConversation.isArchived ? 'Restore conversation' : 'Archive conversation'}>
                    {selectedConversation.isArchived ? <FaUndo /> : <FaArchive />}
                  </button>
                ) : null}
                {selectedConversation ? (
                  <button type="button" onClick={deleteConversation} disabled={isDeletingConversation} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label="Delete conversation" title="Delete conversation">
                    <FaTrash />
                  </button>
                ) : null}
                <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Minimize chat">
                  <FaMinus />
                </button>
              </div>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:hidden">
              <div className="border-b border-slate-200 bg-white p-3">
                <div className="relative">
                  <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={isPatient ? 'Search clinic messages...' : 'Search patients...'}
                  />
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {conversations.map((conversation) => (
                    <button key={conversation.id} type="button" onClick={() => setSelectedConversation(conversation)} className={`shrink-0 rounded-full ${selectedConversation?.id === conversation.id ? 'ring-2 ring-sky-300' : ''}`}>
                      <Avatar user={conversation.otherUser} size="sm" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {selectedConversation ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                  {messages.length ? messages.map((message, index) => (
                    <MessageBubble key={message.id} message={message} previousMessage={messages[index - 1]} currentUserId={currentUser?.id} onDelete={deleteMessage} />
                  )) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-center shadow-sm">
                        <p className="font-semibold text-sky-950">No messages yet</p>
                        <p className="mt-2 text-sm text-slate-500">Send a message to begin the conversation.</p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <footer className="border-t border-slate-200 bg-white p-3">
                  {pendingAttachment ? (
                    <div className="mb-2 flex items-center gap-3 rounded-xl border border-sky-100 bg-sky-50 p-2.5">
                      {pendingAttachment.previewUrl ? <img src={pendingAttachment.previewUrl} alt="Attachment preview" className="h-12 w-12 rounded-lg object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-lg bg-white text-sky-800"><FaFileAlt /></span>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-sky-950">{pendingAttachment.file.name}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">Ready to send</p>
                      </div>
                      <button type="button" onClick={removePendingAttachment} className="grid h-8 w-8 place-items-center rounded-lg text-rose-600 hover:bg-rose-50" aria-label="Remove attachment"><FaTimes /></button>
                    </div>
                  ) : null}
                  <input ref={attachmentInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { selectAttachment(event.target.files?.[0]); event.target.value = '' }} />
                  <div className="flex min-h-14 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1.5 focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-sky-100">
                    <button type="button" onClick={() => attachmentInputRef.current?.click()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-sky-950" aria-label="Attach photo or file" title="Attach photo or file">
                      <FaPaperclip />
                    </button>
                    <textarea
                      className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-sm font-medium leading-5 text-slate-700 outline-none"
                      value={composer}
                      onChange={(event) => setComposer(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder="Write a message..."
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={(!composer.trim() && !pendingAttachment) || isSending}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-950 text-white shadow-sm transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Send message"
                    >
                      <FaPaperPlane />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">Press Enter to send. Shift + Enter starts a new line.</p>
                </footer>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div>
                  <FaComments className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-4 font-semibold text-sky-950">Select a conversation</p>
                  <p className="mt-2 text-sm text-slate-500">Your patient and clinic messages will appear here.</p>
                </div>
              </div>
            )}
          </section>
        </section>
      ) : (
        <button
          type="button"
          {...chatHeadDrag.handlers}
          style={chatHeadDrag.style}
          className={`fixed bottom-5 right-5 z-[45] flex h-16 w-16 touch-none select-none items-center justify-center rounded-full bg-sky-950 text-2xl text-amber-400 shadow-2xl shadow-sky-950/30 focus:outline-none focus:ring-4 focus:ring-sky-200 sm:bottom-6 sm:right-6 ${
            chatHeadDrag.isDragging
              ? 'scale-110 cursor-grabbing shadow-sky-950/50'
              : 'cursor-grab transition-[left,top,transform,box-shadow,background-color] duration-300 ease-out hover:-translate-y-1 hover:bg-sky-900'
          }`}
          aria-label="Open messages"
          title="Drag to move"
        >
          <FaComments />
          {unreadTotal ? (
            <span className="absolute -right-1 -top-1 flex min-h-6 min-w-6 animate-pulse items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white ring-2 ring-white">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          ) : null}
        </button>
      )}
    </>
  )
}

export default FloatingChatHead
