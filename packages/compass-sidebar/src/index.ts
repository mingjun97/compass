import type { ActivateHelpers } from 'hadron-app-registry';
import { registerHadronPlugin, type AppRegistry } from 'hadron-app-registry';
import type { SidebarPluginProps } from './plugin';
import SidebarPlugin from './plugin';
import { createSidebarStore } from './stores';
import { mongoDBInstanceLocator } from '@mongodb-js/compass-app-stores/provider';
import {
  dataServiceLocator,
  type DataService,
} from '@mongodb-js/compass-connections/provider';
import type { MongoDBInstance } from 'mongodb-instance-model';
import type { LoggerAndTelemetry } from '@mongodb-js/compass-logging/provider';
import { createLoggerAndTelemetryLocator } from '@mongodb-js/compass-logging/provider';
import {
  type ConnectionStorage,
  connectionStorageLocator,
} from '@mongodb-js/connection-storage/provider';

export const CompassSidebarPlugin = registerHadronPlugin<
  SidebarPluginProps,
  {
    instance: () => MongoDBInstance;
    dataService: () => DataService;
    connectionStorage: () => ConnectionStorage;
    logger: () => LoggerAndTelemetry;
  }
>(
  {
    name: 'CompassSidebar',
    component: SidebarPlugin,
    activate(
      { initialConnectionInfo }: SidebarPluginProps,
      {
        globalAppRegistry,
        instance,
        dataService,
        connectionStorage,
        logger,
      }: {
        globalAppRegistry: AppRegistry;
        instance: MongoDBInstance;
        dataService: DataService;
        connectionStorage: ConnectionStorage;
        logger: LoggerAndTelemetry;
      },
      helpers: ActivateHelpers
    ) {
      const { store, deactivate } = createSidebarStore(
        {
          globalAppRegistry,
          instance,
          dataService,
          connectionStorage,
          connectionInfo: initialConnectionInfo,
          logger,
        },
        helpers
      );
      return {
        store,
        deactivate,
      };
    },
  },
  {
    instance: mongoDBInstanceLocator,
    dataService: dataServiceLocator,
    connectionStorage: connectionStorageLocator,
    logger: createLoggerAndTelemetryLocator('COMPASS-SIDEBAR-UI'),
  }
);
