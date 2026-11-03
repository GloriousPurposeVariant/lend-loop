/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as categories from "../categories.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_categories from "../lib/categories.js";
import type * as lib_categoryFields from "../lib/categoryFields.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_events from "../lib/events.js";
import type * as lib_loans from "../lib/loans.js";
import type * as lib_signing from "../lib/signing.js";
import type * as lib_toolFields from "../lib/toolFields.js";
import type * as lib_toolImages from "../lib/toolImages.js";
import type * as loans from "../loans.js";
import type * as n8n from "../n8n.js";
import type * as seed from "../seed.js";
import type * as toolImages from "../toolImages.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  categories: typeof categories;
  crons: typeof crons;
  http: typeof http;
  "lib/activity": typeof lib_activity;
  "lib/auth": typeof lib_auth;
  "lib/categories": typeof lib_categories;
  "lib/categoryFields": typeof lib_categoryFields;
  "lib/dates": typeof lib_dates;
  "lib/errors": typeof lib_errors;
  "lib/events": typeof lib_events;
  "lib/loans": typeof lib_loans;
  "lib/signing": typeof lib_signing;
  "lib/toolFields": typeof lib_toolFields;
  "lib/toolImages": typeof lib_toolImages;
  loans: typeof loans;
  n8n: typeof n8n;
  seed: typeof seed;
  toolImages: typeof toolImages;
  tools: typeof tools;
  users: typeof users;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
