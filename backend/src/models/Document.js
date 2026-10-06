import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Document title is required'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
      default: 'Untitled Document',
    },
    content: {
      type: String,
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Document must have an owner'],
      index: true,
    },
    collaborators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to help query documents where user is owner or collaborator
documentSchema.index({ owner: 1, updatedAt: -1 });
documentSchema.index({ collaborators: 1, updatedAt: -1 });

const Document = mongoose.model('Document', documentSchema);

export default Document;

