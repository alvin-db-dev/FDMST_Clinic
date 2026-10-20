import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FaArchive, FaCheckDouble, FaCircle, FaPaperclip, FaPaperPlane, FaSearch, FaTrash, FaUserMd } from 'react-icons/fa'
import { useLocation } from 'react-router-dom'
import { authStorage, fdmstApi } from '../api/fdmstApi.js'
import { useToast } from '../context/ToastContext.jsx'
import { getChatSocket } from '../utils/chatSocket.js'

const filterButtonClass = (active) => `inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-bold transition ${
  active ? 'bg-sky-950 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
}`

function initials(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'FD'
}

function displayName(user) {
  return user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'FDMST User'
}

function RoleBadge({ user }) {
  if (!user?.role) return null
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${user.role === 'staff' ? 'bg-violet-100 text-violet-700' : user.role === 'admin' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'}`}>{user.role}</span>
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const sameDay = date.toDateString() === new Date().toDateString()
  return date.toLocaleString('en-PH', sameDay ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' })
}

function Avatar({ user }) {
  if (user?.profilePhoto) {
    return <img src={user.profilePhoto} alt="" className="h-12 w-12 rounded-2xl object-cover ring-1 ring-slate-100" />
  }

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-950 text-sm font-bold text-amber-400 shadow-sm">
      {initials(user)}
    </span>
  )
}

function ConversationItem({ conversation, active, onClick }) {
  const otherUser = conversation.otherUser
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-sky-50 ${active ? 'bg-sky-50 ring-1 ring-sky-100' : ''}`}
    >
      <div className="relative">
        <Avatar user={otherUser} />
        <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white ${otherUser?.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-semibold text-sky-950">{displayName(otherUser)}</p>
          <RoleBadge user={otherUser} />
          <span className="shrink-0 text-xs font-semibold text-slate-400">{formatTime(conversation.lastMessageAt)}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <p className="truncate text-sm text-slate-500">{conversation.lastMessage || 'No messages yet.'}</p>
          {conversation.unreadCount > 0 ? (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-sky-950">
              {conversation.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}

function MessageBubble({ message, previousMessage, currentUserId }) {
  const mine = String(message.sender) === String(currentUserId)
  const grouped = previousMessage && String(previousMessage.sender) === String(message.sender)

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-4'}`}>
      <div className={`max-w-[78%] rounded-2xl px-4 py-2 shadow-sm ${mine ? 'rounded-br-md bg-sky-950 text-white' : 'rounded-bl-md bg-white text-slate-700 ring-1 ring-slate-100'}`}>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
        <div className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${mine ? 'text-sky-100' : 'text-slate-400'}`}>
          <span>{formatTime(message.createdAt)}</span>
          {mine ? <FaCheckDouble className={message.deliveryStatus === 'read' ? 'text-emerald-300' : 'text-sky-200'} /> : null}
        </div>
      </div>
    </div>
  )
}

function MessagesPage() {
  const toast = useToast()
  const location = useLocation()
  const currentUser = authStorage.getUser()
  const requestedConversationId = new URLSearchParams(location.search).get('conversation')
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
  const [isDeletingConversation, setIsDeletingConversation] = useState(false)
  const messagesEndRef = useRef(null)
  const selectedConversationIdRef = useRef('')

  const loadConversations = useCallback(async ({ preserveSelection = true } = {}) => {
    try {
      const response = await fdmstApi.getConversations({ search, status: filter })
      const nextConversations = response.data || []
      setConversations(nextConversations)

      const requestedConversation = requestedConversationId
        ? nextConversations.find((item) => item.id === requestedConversationId)
        : null

      if (requestedConversation) {
        setSelectedConversation(requestedConversation)
      } else if (!preserveSelection || !selectedConversationIdRef.current) {
        setSelectedConversation(nextConversations[0] || null)
      } else {
        setSelectedConversation((current) => nextConversations.find((item) => item.id === current?.id) || current || nextConversations[0] || null)
      }
    } catch (error) {
      toast.error(error.message || 'Unable to load conversations.')
      setConversations([])
    } finally {
      setIsLoading(false)
    }
  }, [filter, requestedConversationId, search, toast])

  const loadRecipients = useCallback(async () => {
    try {
      const response = await fdmstApi.getMessageRecipients()
      setRecipients(response.data || [])
    } catch {
      setRecipients([])
    }
  }, [])

  useEffect(() => {
    Promise.resolve()
      .then(async () => {
        await loadRecipients()
        await loadConversations({ preserveSelection: true })
      })
  }, [loadConversations, loadRecipients])

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id || ''
  }, [selectedConversation?.id])

  useEffect(() => {
    const conversationId = selectedConversation?.id
    if (!conversationId) return

    let cancelled = false
    fdmstApi.getConversationMessages(conversationId)
      .then((response) => {
        if (cancelled) return
        setMessages(response.data || [])
        setSelectedConversation((current) => response.conversation || current)
        return fdmstApi.markConversationRead(conversationId)
      })
      .then(() => {
        if (!cancelled) {
          setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation))
        }
      })
      .catch((error) => {
        if (!cancelled) toast.error(error.message || 'Unable to load messages.')
      })

    return () => {
      cancelled = true
    }
  }, [selectedConversation?.id, toast])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => {
    const socket = getChatSocket()
    if (!socket) return undefined

    const handleNewMessage = ({ conversationId, message }) => {
      setConversations((current) => current.map((conversation) => (
        conversation.id === String(conversationId)
          ? {
              ...conversation,
              lastMessage: message.content,
              lastMessageAt: message.createdAt,
              unreadCount: selectedConversationIdRef.current === String(conversationId)
                ? 0
                : conversation.lastMessageAt === message.createdAt
                  ? conversation.unreadCount || 0
                  : (conversation.unreadCount || 0) + 1,
            }
          : conversation
      )).sort((left, right) => new Date(right.lastMessageAt || 0) - new Date(left.lastMessageAt || 0)))

      if (selectedConversationIdRef.current === String(conversationId)) {
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
        fdmstApi.markConversationRead(conversationId).catch(() => {})
      }
    }

    const handlePresence = ({ userId, isOnline }) => {
      setConversations((current) => current.map((conversation) => (
        conversation.otherUser?.id === userId
          ? { ...conversation, otherUser: { ...conversation.otherUser, isOnline } }
          : conversation
      )))
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
    socket.on('conversation:deleted', handleDeletedConversation)

    return () => {
      socket.off('message:new', handleNewMessage)
      socket.off('message:notification', handleNewMessage)
      socket.off('presence:update', handlePresence)
      socket.off('conversation:deleted', handleDeletedConversation)
    }
  }, [])

  useEffect(() => {
    const socket = getChatSocket()
    if (!socket || !selectedConversation?.id) return undefined
    socket.emit('conversation:join', selectedConversation.id)
    return () => socket.emit('conversation:leave', selectedConversation.id)
  }, [selectedConversation?.id])

  const filteredRecipients = useMemo(() => {
    const existingIds = new Set(conversations.map((conversation) => String(conversation.otherUser?.id)))
    return recipients.filter((recipient) => !existingIds.has(String(recipient.id)))
  }, [conversations, recipients])

  const startConversation = async (recipient) => {
    try {
      const payload = isPatient ? { clinicUserId: recipient?.id } : recipient.role === 'staff' ? { staffId: recipient.id } : { patientId: recipient.id }
      const response = await fdmstApi.startConversation(payload)
      setSelectedConversation(response.conversation)
      await loadConversations({ preserveSelection: true })
    } catch (error) {
      toast.error(error.message || 'Unable to open conversation.')
    }
  }

  const sendMessage = async () => {
    const content = composer.trim()
    if (!content || !selectedConversation?.id || isSending) return

    setComposer('')
    setIsSending(true)
    try {
      const response = await fdmstApi.sendConversationMessage(selectedConversation.id, { content })
      setMessages((current) => current.some((item) => item.id === response.message.id) ? current : [...current, response.message])
      await loadConversations({ preserveSelection: true })
    } catch (error) {
      setComposer(content)
      toast.error(error.message || 'Unable to send message.')
    } finally {
      setIsSending(false)
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
      toast.error(error.message || 'Unable to delete conversation.')
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

  const otherUser = selectedConversation?.otherUser

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-10rem)] max-w-7xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm lg:grid-cols-[22rem_1fr]">
        <aside className="flex min-h-[34rem] flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={isPatient ? 'Search clinic messages...' : 'Search conversations by name...'}
              />
            </div>
            {!isPatient ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {['active', 'unread', 'archived'].map((item) => (
                  <button key={item} type="button" className={filterButtonClass(filter === item)} onClick={() => setFilter(item)}>
                    {item.charAt(0).toUpperCase() + item.slice(1)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
            {isLoading ? <p className="p-4 text-sm text-slate-500">Loading conversations...</p> : null}
            {!isLoading && conversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                active={selectedConversation?.id === conversation.id}
                onClick={() => setSelectedConversation(conversation)}
              />
            ))}
            {!isLoading && !conversations.length ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                No conversations yet.
              </div>
            ) : null}

            {filteredRecipients.length ? (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-slate-400">Start Conversation</p>
                {filteredRecipients.slice(0, 8).map((recipient) => (
                  <button key={recipient.id} type="button" onClick={() => startConversation(recipient)} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-slate-50">
                    <Avatar user={recipient} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-sky-950">{displayName(recipient)}</span>
                    <RoleBadge user={recipient} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </aside>

        <section className="flex min-h-[34rem] flex-col bg-slate-50">
          {selectedConversation ? (
            <>
              <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
                <div className="flex items-center gap-3">
                  <Avatar user={otherUser} />
                  <div>
                    <h2 className="flex items-center gap-2 font-semibold text-sky-950">{displayName(otherUser)} <RoleBadge user={otherUser} /></h2>
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
                      <FaCircle className={`h-2 w-2 ${otherUser?.isOnline ? 'text-emerald-500' : 'text-slate-300'}`} />
                      {otherUser?.isOnline ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-950 sm:inline-flex">
                    <FaUserMd /> Secure clinic chat
                  </span>
                  <button type="button" onClick={deleteConversation} disabled={isDeletingConversation} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label="Delete conversation" title="Delete conversation">
                    <FaTrash />
                  </button>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                {messages.length ? messages.map((message, index) => (
                  <MessageBubble key={message.id} message={message} previousMessage={messages[index - 1]} currentUserId={currentUser?.id} />
                )) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
                      <p className="font-semibold text-sky-950">No messages yet</p>
                      <p className="mt-2 text-sm text-slate-500">Send a message to begin the conversation.</p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <footer className="border-t border-slate-200 bg-white p-4">
                <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-sky-100">
                  <button type="button" className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-sky-950" aria-label="Attach file">
                    <FaPaperclip />
                  </button>
                  <textarea
                    className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm font-medium text-slate-700 outline-none"
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Write a message..."
                  />
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={!composer.trim() || isSending}
                    className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-950 text-white shadow-sm transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Send message"
                  >
                    <FaPaperPlane />
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-400">Press Enter to send. Shift + Enter starts a new line.</p>
              </footer>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-sm text-center">
                <FaArchive className="mx-auto h-10 w-10 text-slate-300" />
                <h2 className="mt-4 text-lg font-semibold text-sky-950">Select a conversation</h2>
                <p className="mt-2 text-sm text-slate-500">Choose a conversation from the list to view messages and reply securely.</p>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}

export default MessagesPage
