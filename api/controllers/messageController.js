const Message = require('../../models/Message');
const User = require('../../models/User');

// Generate unique message ID
const generateMessageId = () => `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// Send direct message
const sendMessage = async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    const senderId = req.user.id;
    const senderRole = req.user.role;

    // Validate required fields
    if (!receiverId || !content) {
      return res.status(400).json({ 
        status: 'error',
        message: 'Receiver ID and content are required' 
      });
    }

    // Check if sender and receiver exist
    const [sender, receiver] = await Promise.all([
      User.findOne({ id: senderId }),
      User.findOne({ id: receiverId })
    ]);

    if (!sender || !receiver) {
      return res.status(404).json({ 
        status: 'error',
        message: 'User not found' 
      });
    }

    // Validate communication rules
    const canCommunicate = validateCommunication(sender, receiver);
    if (!canCommunicate) {
      return res.status(403).json({ 
        status: 'error',
        message: 'Communication not allowed between these users' 
      });
    }

    // Create and save message
    const message = new Message({
      messageId: generateMessageId(),
      sender: senderId,
      senderRole: sender.role,
      receiver: receiverId,
      receiverRole: receiver.role,
      content,
      status: 'sent'
    });

    await message.save();

    // Update conversation tracking
    await updateConversation(senderId, receiverId, message._id);
    await updateConversation(receiverId, senderId, message._id);

    res.status(201).json({
      status: 'success',
      message: {
        messageId: message.messageId,
        senderId: message.sender,
        senderRole: message.senderRole,
        receiverId: message.receiver,
        content: message.content,
        timestamp: message.createdAt,
        status: message.status
      }
    });

  } catch (err) {
    res.status(500).json({ 
      status: 'error',
      message: 'Server error',
      error: err.message 
    });
  }
};

// Get all conversations for user
const getConversations = async (req, res) => {
    try {
      const user = await User.findOne({ id: req.user.id });
      
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }
  
      // Manually populate withUser details
      const populatedConversations = await Promise.all(
        user.conversations.map(async conv => {
          const withUser = await User.findOne({ id: conv.withUser })
            .select('id name role profilePicture');
          
          const lastMessage = await Message.findById(conv.lastMessage)
            .select('content createdAt status sender');
          
          return {
            withUser: {
              id: withUser?.id,
              name: withUser?.name,
              role: withUser?.role,
              profilePicture: withUser?.profilePicture
            },
            unreadCount: conv.unreadCount,
            lastMessage: lastMessage ? {
              content: lastMessage.content,
              timestamp: lastMessage.createdAt,
              status: lastMessage.status,
              isSender: lastMessage.sender.toString() === req.user.id
            } : null,
            createdAt: conv.createdAt
          };
        })
      );
  
      // Sort conversations
      populatedConversations.sort((a, b) => {
        const dateA = a.lastMessage?.timestamp || a.createdAt;
        const dateB = b.lastMessage?.timestamp || b.createdAt;
        return new Date(dateB) - new Date(dateA);
      });
  
      res.status(200).json({
        status: 'success',
        conversations: populatedConversations
      });
  
    } catch (err) {
      res.status(500).json({ 
        status: 'error',
        message: 'Server error',
        error: err.message 
      });
    }
  };

// Get conversation between two users
const getConversation = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const currentUserId = req.user.id;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: otherUserId },
        { sender: otherUserId, receiver: currentUserId }
      ],
      'deletedBy.userId': { $ne: currentUserId }
    })
    .sort({ createdAt: 1 })
    .populate('senderDetails')
    .populate('receiverDetails');

    // Mark received messages as read
    await Message.updateMany(
      { 
        sender: otherUserId, 
        receiver: currentUserId, 
        status: { $ne: 'read' } 
      },
      { $set: { status: 'read' } }
    );

    // Reset unread count for this conversation
    await User.updateOne(
      { id: currentUserId, 'conversations.withUser': otherUserId },
      { $set: { 'conversations.$.unreadCount': 0 } }
    );

    res.status(200).json({
      status: 'success',
      messages: messages.map(msg => ({
        messageId: msg.messageId,
        senderId: msg.sender,
        senderRole: msg.senderRole,
        senderName: msg.senderDetails?.name,
        receiverId: msg.receiver,
        content: msg.content,
        timestamp: msg.createdAt,
        status: msg.status
      }))
    });

  } catch (err) {
    res.status(500).json({ 
      status: 'error',
      message: 'Server error',
      error: err.message 
    });
  }
};

// Delete a message (soft delete)
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findOne({ messageId });
    if (!message) {
      return res.status(404).json({
        status: 'error',
        message: 'Message not found'
      });
    }

    // Check if user is either sender or receiver
    if (message.sender !== userId && message.receiver !== userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to delete this message'
      });
    }

    // Add user to deletedBy array if not already there
    if (!message.deletedBy.some(entry => entry.userId === userId)) {
      message.deletedBy.push({ userId });
      await message.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Message deleted successfully',
      messageId: message.messageId
    });

  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: err.message
    });
  }
};

// Helper function to validate communication rules
const validateCommunication = (sender, receiver) => {
  // Admins can message anyone
  if (sender.role === 'admin') return true;

  // Students can message their advisor, doctors, or TAs
  if (sender.role === 'student') {
    return receiver.role === 'doctor' || 
           receiver.role === 'ta' ||
           receiver.id === sender.academicAdvisor;
  }

  // Doctors can message their students
  if (sender.role === 'doctor') {
    return receiver.role === 'student';
  }

  // TAs can message their students
  if (sender.role === 'ta') {
    return receiver.role === 'student';
  }

  return false;
};

// Update conversation tracking
const updateConversation = async (userId, otherUserId, messageId) => {
  await User.updateOne(
    { id: userId, 'conversations.withUser': { $ne: otherUserId } },
    { $push: { conversations: { withUser: otherUserId, lastMessage: messageId } } }
  );

  await User.updateOne(
    { id: userId, 'conversations.withUser': otherUserId },
    { 
      $set: { 'conversations.$.lastMessage': messageId },
      $inc: { 'conversations.$.unreadCount': 1 } 
    }
  );
};

module.exports = {
  sendMessage,
  getConversations,
  getConversation,
  deleteMessage
};