import type { InboxMessage } from './inbox.js';
import type { SlackContext } from './types.js';
/** One Socket Mode connection owns its messages, cooldown and pending delivery. */
export declare function createInboxTrigger(ctx: Pick<SlackContext, 'get'>, taskId: () => string, botUserId: () => string | undefined, warn: (message: string) => void): {
    onMessage(message: InboxMessage): void;
    dispose(): void;
};
