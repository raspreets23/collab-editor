import express from 'express';
import mongoose from 'mongoose';
import Document from '../models/Document.js';
import User from '../models/User.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// Apply JWT authentication to all document routes
router.use(authenticateJWT);

/**
 * Helper to check whether a user has read/write permission to a document
 * (Either the document owner or listed in collaborators)
 */
export const hasDocumentAccess = (document, userId) => {
  if (!document || !userId) return false;
  const uid = userId.toString();
  const isOwner = document.owner && document.owner._id 
    ? document.owner._id.toString() === uid 
    : document.owner?.toString() === uid;
  
  if (isOwner) return true;

  return Array.isArray(document.collaborators) && document.collaborators.some(c => {
    const colId = c._id ? c._id.toString() : c.toString();
    return colId === uid;
  });
};

/**
 * @route   GET /api/documents
 * @desc    List all documents owned by or shared with the authenticated user
 * @access  Protected
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch documents where current user is either owner or collaborator
    const documents = await Document.find({
      $or: [{ owner: userId }, { collaborators: userId }],
    })
      .populate('owner', 'name email')
      .populate('collaborators', 'name email')
      .populate('lastEditedBy', 'name email')
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      count: documents.length,
      documents,
    });
  } catch (error) {
    console.error('[Document Route Error - List]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve documents.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route   POST /api/documents
 * @desc    Create a new document
 * @access  Protected
 */
router.post('/', async (req, res) => {
  try {
    const { title, content } = req.body;
    const userId = req.user._id;

    const initialContent = typeof content === 'string' ? content : '# Untitled Document\n\nStart typing markdown here...';
    const docTitle = title && typeof title === 'string' && title.trim().length > 0
      ? title.trim()
      : 'Untitled Document';

    const newDoc = await Document.create({
      title: docTitle,
      content: initialContent,
      owner: userId,
      collaborators: [],
      lastEditedBy: userId,
    });

    const populatedDoc = await Document.findById(newDoc._id)
      .populate('owner', 'name email')
      .populate('collaborators', 'name email')
      .populate('lastEditedBy', 'name email');

    return res.status(201).json({
      success: true,
      message: 'Document created successfully.',
      document: populatedDoc,
    });
  } catch (error) {
    console.error('[Document Route Error - Create]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create document.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route   GET /api/documents/:id
 * @desc    Get a single document by ID (must be owner or collaborator)
 * @access  Protected
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document ID format.',
      });
    }

    const document = await Document.findById(id)
      .populate('owner', 'name email')
      .populate('collaborators', 'name email')
      .populate('lastEditedBy', 'name email');

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    // Check authorization: must be owner or collaborator
    if (!hasDocumentAccess(document, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view this document.',
      });
    }

    return res.status(200).json({
      success: true,
      document,
    });
  } catch (error) {
    console.error('[Document Route Error - Get by ID]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve document.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route   PUT /api/documents/:id
 * @desc    Update document metadata or save content snapshot
 * @access  Protected
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document ID format.',
      });
    }

    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    // Check authorization
    if (!hasDocumentAccess(document, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You cannot edit this document.',
      });
    }

    // Update fields if provided
    if (typeof title === 'string' && title.trim().length > 0) {
      document.title = title.trim();
    }
    if (typeof content === 'string') {
      document.content = content;
    }
    document.lastEditedBy = req.user._id;

    await document.save();

    const updatedDoc = await Document.findById(id)
      .populate('owner', 'name email')
      .populate('collaborators', 'name email')
      .populate('lastEditedBy', 'name email');

    return res.status(200).json({
      success: true,
      message: 'Document updated successfully.',
      document: updatedDoc,
    });
  } catch (error) {
    console.error('[Document Route Error - Update]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update document.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route   DELETE /api/documents/:id
 * @desc    Delete a document (Owner only)
 * @access  Protected (Owner only)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document ID format.',
      });
    }

    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    // Only owner can delete
    if (document.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only the document owner can delete this document.',
      });
    }

    await Document.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Document deleted successfully.',
    });
  } catch (error) {
    console.error('[Document Route Error - Delete]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete document.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * @route   POST /api/documents/:id/share
 * @desc    Add collaborator by email
 * @access  Protected
 */
router.post('/:id/share', async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document ID format.',
      });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'A valid collaborator email is required.',
      });
    }

    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    // Only owner should be able to share (or existing collaborator)
    if (document.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only the document owner can invite collaborators.',
      });
    }

    const targetUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: `No registered user found with email "${email}".`,
      });
    }

    // Check if target user is already owner
    if (targetUser._id.toString() === document.owner.toString()) {
      return res.status(400).json({
        success: false,
        message: 'User is already the owner of this document.',
      });
    }

    // Check if already a collaborator
    const isAlreadyCollaborator = document.collaborators.some(
      (c) => c.toString() === targetUser._id.toString()
    );

    if (isAlreadyCollaborator) {
      return res.status(400).json({
        success: false,
        message: 'User is already a collaborator on this document.',
      });
    }

    document.collaborators.push(targetUser._id);
    await document.save();

    const updatedDoc = await Document.findById(id)
      .populate('owner', 'name email')
      .populate('collaborators', 'name email')
      .populate('lastEditedBy', 'name email');

    return res.status(200).json({
      success: true,
      message: `Collaborator ${targetUser.email} added successfully.`,
      document: updatedDoc,
    });
  } catch (error) {
    console.error('[Document Route Error - Share]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add collaborator.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;

