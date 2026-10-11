/**
 * linkExclusivePanels - make a group of docked panels mutually exclusive.
 *
 * Panels that dock to the same screen area (e.g. Notes, Markers, History,
 * Snapshots, Playlist all dock top-right) must never be open at the same
 * time. Each member describes how to query/close itself and how to observe
 * its own "opened" transition; when any member opens, every other open
 * member of the group is closed.
 */

export interface ExclusiveGroupMember {
  /** Whether the panel is currently open. */
  isOpen(): boolean;
  /** Close the panel. */
  hide(): void;
  /**
   * Subscribe to the panel opening. The callback must be invoked after the
   * panel became open. Returns an unsubscribe function.
   */
  onOpen(callback: () => void): () => void;
}

/**
 * Link the given panels so that opening any of them closes the others.
 * Returns a disposer that removes all subscriptions.
 */
export function linkExclusivePanels(members: readonly ExclusiveGroupMember[]): () => void {
  const unsubscribers = members.map((member) =>
    member.onOpen(() => {
      for (const other of members) {
        if (other !== member && other.isOpen()) {
          other.hide();
        }
      }
    }),
  );
  return () => {
    for (const unsub of unsubscribers) unsub();
  };
}
