import type { ContentBlock } from "../../../core/types/session";
import { contentText, copyText } from "./conversation-format";
import { MessageToolbar, type MessageToolbarProps } from "./message-toolbar";

export function UserBubble({ content, timestamp, ...actions }: {
  content: string | ContentBlock[];
  timestamp?: number;
} & Omit<MessageToolbarProps, "onCopy">) {
  return (
    <div className="chat-turn user-turn message-row user" tabIndex={0} aria-label="User message"
      onClick={event => { if (!(event.target as HTMLElement).closest("button")) event.currentTarget.focus(); }}>
      <div className="user-bubble">
        {Array.isArray(content) ? content.map((block, index) => {
          if (block.type === "image") return <img key={index} src={`data:${block.mimeType};base64,${block.data}`} alt="User attachment" className="user-attachment-img" />;
          if (block.type === "text") return <div key={index} className="user-text">{block.text}</div>;
          return null;
        }) : <div className="user-text">{content}</div>}
      </div>
      {timestamp !== undefined && <span className="turn-timestamp">{new Date(timestamp).toLocaleTimeString()}</span>}
      <MessageToolbar {...actions} onCopy={() => copyText(contentText(content))} />
    </div>
  );
}
