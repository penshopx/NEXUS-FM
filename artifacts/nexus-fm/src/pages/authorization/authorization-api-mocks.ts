import type * as ApiClient from '@workspace/api-client-react';

type ApiClientModule = typeof ApiClient;
type ApiHookName = {
  [Name in keyof ApiClientModule]: Name extends `use${string}`
    ? ApiClientModule[Name] extends (...args: never[]) => unknown
      ? Name
      : never
    : never;
}[keyof ApiClientModule];

export type AuthorizationApiHook<Name extends ApiHookName> = Extract<
  ApiClientModule[Name],
  (...args: never[]) => unknown
>;

export type AuthorizationHookParameters<Name extends ApiHookName> = Parameters<
  AuthorizationApiHook<Name>
>;

export type AuthorizationApiHookMock<Name extends ApiHookName> = (
  ...args: AuthorizationHookParameters<Name>
) => Partial<ReturnType<AuthorizationApiHook<Name>>>;

export type AuthorizationApiOverrides<Names extends ApiHookName> = {
  [Name in Names]: AuthorizationApiHookMock<Name>;
};