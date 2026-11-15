import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CornerDownRight,
  Edit3,
  Flag,
  MessageSquare,
  Send,
  Trash2,
} from 'lucide-react';
import { socialService } from '../../services/social.service';
import { useAuthStore } from '../../store/auth.store';
import { CommentItem } from '../../types';
import { Button, Skeleton } from '../ui/DesignSystem';
import { formatVietnamDateTime } from '../../utils/format';
import { ReportModal } from '../moderation/ReportModal';

export const CommentInput: React.FC<{
  placeholder?: string;
  initialValue?: string;
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}> = ({
  placeholder = 'Viết bình luận chia sẻ kinh nghiệm...',
  initialValue = '',
  onSubmit,
  onCancel,
  submitLabel = 'Gửi',
}) => {
  const [content, setContent] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(content.trim());
      setContent('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleFormSubmit} className="flex items-start gap-2">
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-3.5 py-2 text-xs sm:text-sm rounded-xl bg-stone-100 focus:bg-white border border-transparent focus:border-emerald-600 focus:outline-none"
      />
      {onCancel && (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Hủy
        </Button>
      )}
      <Button
        type="submit"
        variant="primary"
        size="sm"
        isLoading={submitting}
        disabled={!content.trim()}
      >
        <Send className="w-3.5 h-3.5" />
        {submitLabel}
      </Button>
    </form>
  );
};

export const ReplyThread: React.FC<{
  parentComment: CommentItem;
  replies: CommentItem[];
  postAuthorId: string;
  onReplySubmit: (parentId: string, content: string) => Promise<void>;
  onEditComment: (commentId: string, content: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}> = ({
  parentComment,
  replies,
  postAuthorId,
  onReplySubmit,
  onEditComment,
  onDeleteComment,
}) => {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [replying, setReplying] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reportingComment, setReportingComment] = useState<CommentItem | null>(
    null,
  );

  const canModify = (comment: CommentItem) => {
    if (!user) return false;
    return (
      user.id === comment.authorId ||
      user.id === postAuthorId ||
      user.role === 'ADMIN'
    );
  };

  const canEdit = (comment: CommentItem) => {
    return Boolean(user && user.id === comment.authorId);
  };

  const renderCommentNode = (comment: CommentItem, isReply = false) => (
    <div
      key={comment.id}
      className={
        isReply ? 'ml-8 pl-3 border-l-2 border-emerald-100 mt-2.5' : ''
      }
    >
      <div className="flex items-start gap-2.5">
        <Link to={`/users/${comment.author.username}`} className="shrink-0">
          <img
            src={
              comment.author.avatarUrl ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author.fullName)}&background=166534&color=fff`
            }
            alt={comment.author.fullName}
            className="w-7 h-7 rounded-full object-cover border border-stone-200"
          />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="bg-stone-100/90 rounded-2xl px-3.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <Link
                to={`/users/${comment.author.username}`}
                className="text-xs font-bold text-stone-900 hover:text-emerald-700"
              >
                {comment.author.fullName}
              </Link>
              <span className="text-[10px] text-stone-400">
                {formatVietnamDateTime(comment.createdAt)}
                {comment.isEdited && ' • Đã sửa'}
              </span>
            </div>

            {editingId === comment.id ? (
              <div className="mt-2">
                <CommentInput
                  initialValue={comment.content}
                  submitLabel="Lưu"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (newText) => {
                    await onEditComment(comment.id, newText);
                    setEditingId(null);
                  }}
                />
              </div>
            ) : (
              <p className="text-xs text-stone-800 mt-1 whitespace-pre-line break-words">
                {comment.content}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 px-2 text-[11px] text-stone-500">
            {!isReply && (
              <button
                type="button"
                onClick={() => {
                  if (!isAuthenticated) {
                    navigate('/login');
                    return;
                  }
                  setReplying((v) => !v);
                }}
                className="font-medium hover:text-emerald-700 inline-flex items-center gap-1"
              >
                <CornerDownRight className="w-3 h-3" />
                Trả lời
              </button>
            )}

            {canEdit(comment) && editingId !== comment.id && (
              <button
                type="button"
                onClick={() => setEditingId(comment.id)}
                className="hover:text-emerald-700 inline-flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" />
                Sửa
              </button>
            )}

            {canModify(comment) && (
              <button
                type="button"
                onClick={() => onDeleteComment(comment.id)}
                className="hover:text-red-600 inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Xóa
              </button>
            )}

            {user && user.id !== comment.authorId && (
              <button
                type="button"
                onClick={() => setReportingComment(comment)}
                className="hover:text-amber-600 inline-flex items-center gap-1"
              >
                <Flag className="w-3 h-3" />
                Báo cáo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {renderCommentNode(parentComment, false)}
      {replies.map((reply) => renderCommentNode(reply, true))}

      {replying && (
        <div className="ml-8 mt-2">
          <CommentInput
            placeholder={`Trả lời ${parentComment.author.fullName}...`}
            submitLabel="Trả lời"
            onCancel={() => setReplying(false)}
            onSubmit={async (text) => {
              await onReplySubmit(parentComment.id, text);
              setReplying(false);
            }}
          />
        </div>
      )}

      {reportingComment && (
        <ReportModal
          isOpen={Boolean(reportingComment)}
          onClose={() => setReportingComment(null)}
          targetType="COMMENT"
          targetId={reportingComment.id}
          targetLabel={`Bình luận của ${reportingComment.author.fullName}`}
        />
      )}
    </div>
  );
};

export const CommentSection: React.FC<{
  postId: string;
  postAuthorId: string;
  onCommentsCountChange?: (delta: number) => void;
}> = ({ postId, postAuthorId, onCommentsCountChange }) => {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['post-comments', postId],
    queryFn: () => socialService.getComments(postId),
  });

  const rootComments = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = comments.reduce<Record<string, CommentItem[]>>(
    (acc, item) => {
      if (item.parentCommentId) {
        acc[item.parentCommentId] = acc[item.parentCommentId] || [];
        acc[item.parentCommentId].push(item);
      }
      return acc;
    },
    {},
  );

  const handleAddComment = async (content: string, parentCommentId?: string) => {
    await socialService.createComment(postId, { content, parentCommentId });
    onCommentsCountChange?.(1);
    queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
    queryClient.invalidateQueries({ queryKey: ['post-detail', postId] });
  };

  const handleEditComment = async (commentId: string, content: string) => {
    await socialService.updateComment(commentId, { content });
    queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
  };

  const handleDeleteComment = async (commentId: string) => {
    const res = await socialService.deleteComment(commentId);
    onCommentsCountChange?.(-(res.deletedCount || 1));
    queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
    queryClient.invalidateQueries({ queryKey: ['post-detail', postId] });
  };

  return (
    <div className="pt-3 mt-3 border-t border-stone-100 space-y-3">
      {isAuthenticated ? (
        <CommentInput
          onSubmit={(content) => handleAddComment(content)}
          placeholder="Viết bình luận hoặc đặt câu hỏi về chuyến đi..."
        />
      ) : (
        <div className="text-xs text-stone-500 bg-stone-50 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
            Đăng nhập để tham gia bình luận bài viết này
          </span>
          <Link
            to="/login"
            className="font-semibold text-emerald-700 hover:underline"
          >
            Đăng nhập
          </Link>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-5/6" />
        </div>
      ) : rootComments.length === 0 ? (
        <p className="text-xs text-stone-400 text-center py-2">
          Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nghĩ!
        </p>
      ) : (
        <div className="space-y-3">
          {rootComments.map((root) => (
            <ReplyThread
              key={root.id}
              parentComment={root}
              replies={repliesByParent[root.id] || []}
              postAuthorId={postAuthorId}
              onReplySubmit={(parentId, text) =>
                handleAddComment(text, parentId)
              }
              onEditComment={handleEditComment}
              onDeleteComment={handleDeleteComment}
            />
          ))}
        </div>
      )}
    </div>
  );
};
