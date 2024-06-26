import React, { useCallback, useMemo, useRef, useState } from 'react';
import { connect } from 'react-redux';
import {
  useActiveConnections,
  useConnections,
} from '@mongodb-js/compass-connections/provider';
import {
  type ConnectionInfo,
  getConnectionTitle,
} from '@mongodb-js/connection-info';
import { SavedConnectionList } from './saved-connections/saved-connection-list';
import {
  ResizableSidebar,
  css,
  Link,
  useToast,
  spacing,
  openToast,
} from '@mongodb-js/compass-components';
import { SidebarHeader } from './header/sidebar-header';
import { ConnectionFormModal } from '@mongodb-js/connection-form';
import { cloneDeep } from 'lodash';
import { usePreference } from 'compass-preferences-model/provider';
import ActiveConnectionNavigation from './active-connections/active-connection-navigation';
import type { SidebarThunkAction } from '../../modules';
import { Navigation } from './navigation/navigation';
import ConnectionInfoModal from '../connection-info-modal';
import { useMaybeProtectConnectionString } from '@mongodb-js/compass-maybe-protect-connection-string';
import type { WorkspaceTab } from '@mongodb-js/compass-workspaces';

const TOAST_TIMEOUT_MS = 5000; // 5 seconds.

type MultipleConnectionSidebarProps = {
  activeWorkspace: WorkspaceTab | null;
  onSidebarAction(action: string, ...rest: any[]): void;
};

const sidebarStyles = css({
  // Sidebar internally has z-indexes higher than zero. We set zero on the
  // container so that the sidebar doesn't stick out in the layout z ordering
  // with other parts of the app
  zIndex: 0,
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
});

type ConnectionErrorToastBodyProps = {
  info: ConnectionInfo | null;
  onReview: () => void;
};

const connectionErrorToastBodyStyles = css({
  display: 'flex',
  alignItems: 'start',
  gap: spacing[2],
});

const connectionErrorToastActionMessageStyles = css({
  marginTop: spacing[1],
  flexGrow: 0,
});

function ConnectionErrorToastBody({
  info,
  onReview,
}: ConnectionErrorToastBodyProps): React.ReactElement {
  return (
    <span className={connectionErrorToastBodyStyles}>
      <span>
        There was a problem connecting{' '}
        {info ? `to ${getConnectionTitle(info)}` : ''}
      </span>
      {info && (
        <Link
          className={connectionErrorToastActionMessageStyles}
          hideExternalIcon={true}
          onClick={onReview}
        >
          REVIEW
        </Link>
      )}
    </span>
  );
}

function activeConnectionNotFoundError(
  description = 'Connection not found. Please try again'
) {
  openToast('active-connection-not-found', {
    title: 'Error',
    description,
    variant: 'warning',
    timeout: TOAST_TIMEOUT_MS,
  });
}

async function copyConnectionString(connectionString: string) {
  try {
    await navigator.clipboard.writeText(connectionString);
    openToast('copy-to-clipboard', {
      title: 'Success',
      description: 'Copied to clipboard.',
      variant: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });
  } catch {
    openToast('copy-to-clipboard', {
      title: 'Error',
      description:
        'An error occurred when copying to clipboard. Please try again.',
      variant: 'warning',
      timeout: TOAST_TIMEOUT_MS,
    });
  }
}

export function MultipleConnectionSidebar({
  activeWorkspace,
  onSidebarAction,
}: MultipleConnectionSidebarProps) {
  const { openToast, closeToast } = useToast('multiple-connection-status');
  const cancelCurrentConnectionRef = useRef<(id: string) => Promise<void>>();
  const activeConnections = useActiveConnections();
  const maybeProtectConnectionString = useMaybeProtectConnectionString();

  const [isConnectionFormOpen, setIsConnectionFormOpen] = useState(false);
  const [connectionInfoModalConnectionId, setConnectionInfoModalConnectionId] =
    useState<string | undefined>();

  const findActiveConnection = useCallback(
    (connectionId: string) =>
      activeConnections.find(({ id }) => id === connectionId),
    [activeConnections]
  );

  const onConnected = useCallback(
    (info: ConnectionInfo) => {
      closeToast(`connection-status-${info.id}`);
    },
    [closeToast]
  );

  const onConnectionAttemptStarted = useCallback(
    (info: ConnectionInfo) => {
      const cancelAndCloseToast = () => {
        void cancelCurrentConnectionRef.current?.(info.id);
        closeToast(`connection-status-${info.id}`);
      };

      openToast(`connection-status-${info.id}`, {
        title: `Connecting to ${getConnectionTitle(info)}`,
        dismissible: true,
        variant: 'progress',
        actionElement: (
          <Link hideExternalIcon={true} onClick={cancelAndCloseToast}>
            CANCEL
          </Link>
        ),
      });
    },
    [openToast, closeToast, cancelCurrentConnectionRef]
  );

  const onConnectionFailed = useCallback(
    (info: ConnectionInfo | null, error: Error) => {
      const reviewAndCloseToast = () => {
        closeToast(`connection-status-${info?.id ?? ''}`);
        setIsConnectionFormOpen(true);
      };

      openToast(`connection-status-${info?.id}`, {
        title: `${error.message}`,
        description: (
          <ConnectionErrorToastBody
            info={info}
            onReview={reviewAndCloseToast}
          />
        ),
        variant: 'warning',
      });
    },
    [openToast, closeToast, setIsConnectionFormOpen]
  );

  const {
    setActiveConnectionById,
    connect,
    favoriteConnections,
    recentConnections,
    cancelConnectionAttempt,
    removeConnection,
    saveConnection,
    duplicateConnection,
    createNewConnection,
    state,
  } = useConnections({
    onConnected: onConnected,
    onConnectionAttemptStarted: onConnectionAttemptStarted,
    onConnectionFailed(info, error) {
      void onConnectionFailed(info, error);
    },
  });

  const { activeConnectionId, activeConnectionInfo, connectionErrorMessage } =
    state;

  cancelCurrentConnectionRef.current = cancelConnectionAttempt;

  const onConnect = useCallback(
    (info: ConnectionInfo) => {
      setActiveConnectionById(info.id);
      void connect(info);
    },
    [connect, setActiveConnectionById]
  );

  const onNewConnectionOpen = useCallback(() => {
    createNewConnection();
    setIsConnectionFormOpen(true);
  }, [createNewConnection]);
  const onNewConnectionClose = useCallback(
    () => setIsConnectionFormOpen(false),
    []
  );
  const onNewConnectionToggle = useCallback(
    (open: boolean) => setIsConnectionFormOpen(open),
    []
  );

  const onNewConnectionConnect = useCallback(
    (connectionInfo) => {
      void connect({
        ...cloneDeep(connectionInfo),
      }).then(() => setIsConnectionFormOpen(false));
    },
    [connect]
  );

  const onSaveNewConnection = useCallback(
    async (connectionInfo) => {
      await saveConnection(connectionInfo);
      setIsConnectionFormOpen(false);
    },
    [saveConnection]
  );

  const onDeleteConnection = useCallback(
    (info: ConnectionInfo) => {
      void removeConnection(info);
    },
    [removeConnection]
  );

  const onEditConnection = useCallback(
    (info: ConnectionInfo) => {
      setActiveConnectionById(info.id);
      setIsConnectionFormOpen(true);
    },
    [setActiveConnectionById, setIsConnectionFormOpen]
  );

  const onDuplicateConnection = useCallback(
    (info: ConnectionInfo) => {
      duplicateConnection(info);
      setIsConnectionFormOpen(true);
    },
    [duplicateConnection, setIsConnectionFormOpen]
  );

  const onToggleFavoriteConnectionInfo = useCallback(
    (info: ConnectionInfo) => {
      info.savedConnectionType =
        info.savedConnectionType === 'favorite' ? 'recent' : 'favorite';

      void saveConnection(info);
    },
    [saveConnection]
  );

  const onToggleFavoriteActiveConnection = useCallback(
    (connectionId: ConnectionInfo['id']) => {
      const connectionInfo = findActiveConnection(connectionId);
      if (!connectionInfo) {
        activeConnectionNotFoundError(
          'Favorite/Unfavorite action failed - Connection not found. Please try again.'
        );
        return;
      }
      onToggleFavoriteConnectionInfo(connectionInfo);
    },
    [onToggleFavoriteConnectionInfo, findActiveConnection]
  );

  const onOpenConnectionInfo = useCallback(
    (connectionId: string) => setConnectionInfoModalConnectionId(connectionId),
    []
  );

  const onCloseConnectionInfo = useCallback(
    () => setConnectionInfoModalConnectionId(undefined),
    []
  );

  const onCopyActiveConnectionString = useCallback(
    (connectionId: string) => {
      const connectionInfo = findActiveConnection(connectionId);
      if (!connectionInfo) {
        activeConnectionNotFoundError(
          'Copying to clipboard failed - Connection not found. Please try again.'
        );
        return;
      }
      void copyConnectionString(
        maybeProtectConnectionString(
          connectionInfo?.connectionOptions.connectionString
        )
      );
    },
    [findActiveConnection, maybeProtectConnectionString]
  );

  const protectConnectionStrings = usePreference('protectConnectionStrings');
  const forceConnectionOptions = usePreference('forceConnectionOptions');
  const showKerberosPasswordField = usePreference('showKerberosPasswordField');
  const showOIDCDeviceAuthFlow = usePreference('showOIDCDeviceAuthFlow');
  const enableOidc = usePreference('enableOidc');
  const enableDebugUseCsfleSchemaMap = usePreference(
    'enableDebugUseCsfleSchemaMap'
  );
  const protectConnectionStringsForNewConnections = usePreference(
    'protectConnectionStringsForNewConnections'
  );

  const preferences = useMemo(
    () => ({
      protectConnectionStrings,
      forceConnectionOptions,
      showKerberosPasswordField,
      showOIDCDeviceAuthFlow,
      enableOidc,
      enableDebugUseCsfleSchemaMap,
      protectConnectionStringsForNewConnections,
    }),
    [
      protectConnectionStrings,
      forceConnectionOptions,
      showKerberosPasswordField,
      showOIDCDeviceAuthFlow,
      enableOidc,
      enableDebugUseCsfleSchemaMap,
      protectConnectionStringsForNewConnections,
    ]
  );

  return (
    <ResizableSidebar data-testid="navigation-sidebar">
      <aside className={sidebarStyles}>
        <SidebarHeader onAction={onSidebarAction} />
        <Navigation currentLocation={activeWorkspace?.type ?? null} />
        <ActiveConnectionNavigation
          activeConnections={activeConnections}
          activeWorkspace={activeWorkspace ?? undefined}
          onOpenConnectionInfo={onOpenConnectionInfo}
          onCopyConnectionString={onCopyActiveConnectionString}
          onToggleFavoriteConnection={onToggleFavoriteActiveConnection}
        />
        <SavedConnectionList
          favoriteConnections={favoriteConnections}
          nonFavoriteConnections={recentConnections}
          onConnect={onConnect}
          onNewConnection={onNewConnectionOpen}
          onEditConnection={onEditConnection}
          onDeleteConnection={onDeleteConnection}
          onDuplicateConnection={onDuplicateConnection}
          onToggleFavoriteConnection={onToggleFavoriteConnectionInfo}
        />
        <ConnectionFormModal
          isOpen={isConnectionFormOpen}
          setOpen={onNewConnectionToggle}
          onCancel={onNewConnectionClose}
          onConnectClicked={onNewConnectionConnect}
          key={activeConnectionId}
          onSaveConnectionClicked={onSaveNewConnection}
          initialConnectionInfo={activeConnectionInfo}
          connectionErrorMessage={connectionErrorMessage}
          preferences={preferences}
        />
        <ConnectionInfoModal
          connectionInfo={
            connectionInfoModalConnectionId
              ? findActiveConnection(connectionInfoModalConnectionId)
              : undefined
          }
          isVisible={!!connectionInfoModalConnectionId}
          close={onCloseConnectionInfo}
        />
      </aside>
    </ResizableSidebar>
  );
}

const onSidebarAction = (
  action: string,
  ...rest: any[]
): SidebarThunkAction<void> => {
  return (_dispatch, _getState, { globalAppRegistry }) => {
    globalAppRegistry.emit(action, ...rest);
  };
};

const MappedMultipleConnectionSidebar = connect(undefined, {
  onSidebarAction,
})(MultipleConnectionSidebar);

export default MappedMultipleConnectionSidebar;
