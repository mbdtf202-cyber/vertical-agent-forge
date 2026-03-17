declare module "openclaw/plugin-sdk/core" {
  export type GatewayMethodError = {
    code: string;
    message: string;
  };

  export type GatewayRequestHandlerOptions = {
    params?: unknown;
    respond: (ok: boolean, payload?: unknown, error?: GatewayMethodError) => void;
  };

  export type OpenClawPluginServiceContext = {
    workspaceDir?: string;
    stateDir: string;
  };

  export type OpenClawPluginService = {
    id: string;
    start: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
    stop?: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
  };

  export type OpenClawPluginApi = {
    pluginConfig: unknown;
    version?: string;
    source: string;
    logger: {
      info?: (message: string) => void;
      warn?: (message: string) => void;
      error?: (message: string) => void;
    };
    registerService: (service: OpenClawPluginService) => void;
    registerGatewayMethod: (
      method: string,
      handler: (opts: GatewayRequestHandlerOptions) => void | Promise<void>,
    ) => void;
  };
}
