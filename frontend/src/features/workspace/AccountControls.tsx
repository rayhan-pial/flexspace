import { useState } from 'react'
import Button from '../../shared/ui/Button'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import { LogOutIcon } from '../../shared/ui/icons'
import { useSessionStore } from '../auth/sessionStore'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'

/**
 * The signed-in account and Log out. Logging out with unsaved changes asks first. `layout="rail"`
 * is the stacked form for the application rail (icon-only below 1440px); `header` is a single row.
 */
export default function AccountControls({ layout }: { layout: 'header' | 'rail' }) {
  const user = useSessionStore((s) => s.user)
  const logout = useSessionStore((s) => s.logout)
  const dirty = useEditorStore(selectIsDirty)
  const [confirming, setConfirming] = useState(false)
  const rail = layout === 'rail'

  return (
    <>
      <div className={rail ? 'flex min-w-0 flex-col items-center gap-2 min-[1440px]:items-stretch' : 'flex min-w-0 items-center gap-3 text-sm sm:gap-4'}>
        <span
          className={rail ? 'sr-only min-[1440px]:not-sr-only min-[1440px]:truncate min-[1440px]:px-1 min-[1440px]:text-xs min-[1440px]:text-ui-muted' : 'min-w-0 truncate text-ui-muted'}
          title={user?.email}
          data-testid="current-user"
        >
          {user?.email}
        </span>
        <Button
          className={rail ? 'w-11 min-[1440px]:w-full' : 'shrink-0'}
          title="Log out"
          aria-label={rail ? 'Log out' : undefined}
          onClick={() => (dirty ? setConfirming(true) : void logout())}
        >
          {rail ? (
            <>
              <LogOutIcon />
              <span className="sr-only min-[1440px]:not-sr-only">Log out</span>
            </>
          ) : (
            'Log out'
          )}
        </Button>
      </div>
      {confirming && (
        <ConfirmDialog
          destructive
          title="Log out and discard changes?"
          message="You have unsaved changes. Logging out will discard them."
          confirmLabel="Discard and log out"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            void logout()
          }}
        />
      )}
    </>
  )
}
