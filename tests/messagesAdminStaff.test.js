const test = require('node:test')
const assert = require('node:assert/strict')

const User = require('../models/User')
const Conversation = require('../models/Conversation')
const Message = require('../models/Message')
const router = require('../routes/messages')

const routeHandler = (path, method) => router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle

const invoke = (handler, req) => new Promise((resolve, reject) => {
  const res = {
    status(code) { this.statusCode = code; return this },
    json(body) { resolve({ status: this.statusCode || 200, body }) },
  }
  handler(req, res, reject)
})

test('admin message recipients include active staff and patients', async () => {
  const originalFind = User.find
  let query
  User.find = (value) => {
    query = value
    return {
      sort() { return this },
      select() { return this },
      limit() { return Promise.resolve([
        { _id: 'staff-id', firstName: 'Sam', lastName: 'Staff', role: 'staff' },
        { _id: 'patient-id', firstName: 'Pat', lastName: 'Patient', role: 'patient' },
      ]) },
    }
  }

  try {
    const { body } = await invoke(routeHandler('/recipients', 'get'), { user: { id: 'admin-id', role: 'admin' } })
    assert.deepEqual(body.data.map((user) => user.role), ['staff', 'patient'])
    assert.deepEqual(query.$or, [
      { role: 'patient', status: { $ne: 'inactive' } },
      { role: 'staff', status: 'active' },
    ])
  } finally {
    User.find = originalFind
  }
})

test('admin can start a conversation with active staff', async () => {
  const originals = {
    findOne: User.findOne,
    conversationFindOne: Conversation.findOne,
    create: Conversation.create,
    updateOne: Conversation.updateOne,
    findById: Conversation.findById,
    countDocuments: Message.countDocuments,
    messageFindOne: Message.findOne,
  }
  const adminId = '507f1f77bcf86cd799439011'
  const staffId = '507f1f77bcf86cd799439012'
  const admin = { _id: adminId, firstName: 'Ada', role: 'admin' }
  const staff = { _id: staffId, firstName: 'Sam', role: 'staff' }
  let created
  let recipientQuery

  User.findOne = async (query) => { recipientQuery = query; return staff }
  Conversation.findOne = async () => null
  Conversation.create = async (data) => { created = data; return { _id: 'conversation-id' } }
  Conversation.updateOne = async () => ({})
  Conversation.findById = () => ({
    populate() { return this },
    then(resolve, reject) {
      return Promise.resolve({ _id: 'conversation-id', patient: staff, clinicUser: admin, participants: [staff, admin], createdAt: new Date() }).then(resolve, reject)
    },
  })
  Message.countDocuments = async () => 0
  Message.findOne = () => ({ sort() { return this }, select() { return this }, lean() { return Promise.resolve(null) } })

  try {
    const { status, body } = await invoke(routeHandler('/conversations', 'post'), { user: { id: adminId, role: 'admin' }, body: { staffId }, query: {} })
    assert.equal(status, 201)
    assert.equal(body.conversation.otherUser.role, 'staff')
    assert.equal(created.patient, staffId)
    assert.equal(created.clinicUser, adminId)
    assert.deepEqual(recipientQuery, { _id: staffId, role: 'staff', status: 'active' })
  } finally {
    User.findOne = originals.findOne
    Conversation.findOne = originals.conversationFindOne
    Conversation.create = originals.create
    Conversation.updateOne = originals.updateOne
    Conversation.findById = originals.findById
    Message.countDocuments = originals.countDocuments
    Message.findOne = originals.messageFindOne
  }
})
