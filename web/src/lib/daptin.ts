/**
 * Client for the local daptin backend.
 *
 * Paths are relative so the Vite dev proxy (see `vite.config.ts`) serves them
 * from the same origin. In a deployed build the same paths must be routed to the
 * backend by whatever serves `web/`.
 */

export const JSONAPI = 'application/vnd.api+json'

/** Status 0 marks a transport failure: the backend could not be reached. */
export class BackendError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly hint?: string,
  ) {
    super(message)
    this.name = 'BackendError'
  }
}

export type Column = {
  name: string
  type: string
  dataType: string
  nullable: boolean
  unique: boolean
  defaultValue: string | null
  isForeignKey: boolean
}

export type Entity = {
  name: string
  isTopLevel: boolean
  icon: string
  columns: Column[]
}

export type RecordRow = { id: string; attributes: Record<string, unknown> }

export type RecordPage = {
  rows: RecordRow[]
  total: number
  lastPage: number
}

const SYSTEM_COLUMNS = new Set([
  'id',
  'version',
  'created_at',
  'updated_at',
  'reference_id',
  'permission',
  'user_account_id',
])

/** Column types this scaffold can render as a plain input. */
const EDITABLE_TYPES = new Set(['label', 'measurement', 'url', 'text', 'boolean'])

type WorldSchema = {
  TableName?: string
  Columns?: Array<{
    ColumnName?: string
    ColumnType?: string
    DataType?: string
    IsNullable?: boolean
    IsUnique?: boolean
    IsForeignKey?: boolean
    DefaultValue?: unknown
    ForeignKeyData?: { DataSource?: string } | null
  }>
}

/** Parse the `world` collection into entities with their column definitions. */
export function parseEntities(payload: unknown): Entity[] {
  const rows = (payload as { data?: unknown[] } | null)?.data
  if (!Array.isArray(rows)) return []

  const entities: Entity[] = []
  for (const row of rows) {
    const attributes = (row as { attributes?: Record<string, unknown> }).attributes
    if (!attributes) continue
    if (attributes.is_join_table === true || attributes.is_hidden === true) continue

    const name = String(attributes.table_name ?? '')
    if (!name) continue

    entities.push({
      name,
      isTopLevel: attributes.is_top_level === true,
      icon: String(attributes.icon ?? ''),
      columns: parseSchema(String(attributes.world_schema_json ?? '')),
    })
  }

  return entities.sort((a, b) => a.name.localeCompare(b.name))
}

function parseSchema(raw: string): Column[] {
  if (!raw) return []
  let schema: WorldSchema
  try {
    schema = JSON.parse(raw) as WorldSchema
  } catch {
    return []
  }
  return (schema.Columns ?? []).map((column) => ({
    name: String(column.ColumnName ?? ''),
    type: String(column.ColumnType ?? ''),
    dataType: String(column.DataType ?? ''),
    nullable: column.IsNullable === true,
    unique: column.IsUnique === true,
    defaultValue: column.DefaultValue == null ? null : String(column.DefaultValue),
    // daptin fills ForeignKeyData on every column; only a "self" data source
    // with IsForeignKey marks a real relation (see daptin's dbfunctions_create.go).
    isForeignKey: column.IsForeignKey === true && column.ForeignKeyData?.DataSource === 'self',
  }))
}

/** Columns a person can fill in through a plain form control. */
export function editableColumns(entity: Entity): Column[] {
  return entity.columns.filter(
    (column) =>
      column.name.length > 0 &&
      !SYSTEM_COLUMNS.has(column.name) &&
      !column.isForeignKey &&
      EDITABLE_TYPES.has(column.type),
  )
}

export function isRequired(column: Column): boolean {
  return !column.nullable && column.defaultValue === null
}

export function isNumeric(column: Column): boolean {
  return column.type === 'measurement' || /int|numeric|decimal|real|double/i.test(column.dataType)
}

export function buildListUrl(
  table: string,
  options: { page?: number; size?: number; sort?: string } = {},
): string {
  const params = new URLSearchParams()
  params.set('page[number]', String(options.page ?? 1))
  params.set('page[size]', String(options.size ?? 25))
  if (options.sort) params.set('sort', options.sort)
  return `/api/${table}?${params.toString()}`
}

/** Error text comes from the response body when it carries one. */
export function parseErrorMessage(status: number, body: unknown, statusText = ''): BackendError {
  const payload = body as
    | { errors?: Array<{ status?: string; title?: string; detail?: string }> }
    | Array<{ Attributes?: { message?: string; title?: string } }>
    | null

  let message = ''
  if (payload && !Array.isArray(payload) && Array.isArray(payload.errors)) {
    const first = payload.errors[0]
    message = first?.detail || first?.title || ''
  }
  if (!message && Array.isArray(payload)) {
    const notify = payload.find((entry) => entry?.Attributes?.message)
    message = notify?.Attributes?.message ?? ''
  }
  if (!message) message = statusText || `Request failed with status ${status}`

  return new BackendError(status, message, hintForStatus(status))
}

function hintForStatus(status: number): string | undefined {
  if (status === 401) return 'Sign in again to continue.'
  if (status === 403) return 'This account is not allowed to do that on this table.'
  if (status === 404) return 'No record with that id exists.'
  return undefined
}

function transportError(cause: unknown): BackendError {
  const detail = cause instanceof Error ? cause.message : String(cause)
  return new BackendError(
    0,
    `Cannot reach the backend (${detail}).`,
    'Start it with `docker compose up -d --wait` in daptin/, then reload.',
  )
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string | null; body?: unknown; accept?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: options.accept ?? JSONAPI }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  if (options.body !== undefined) headers['Content-Type'] = JSONAPI

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch (cause) {
    throw transportError(cause)
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) throw parseErrorMessage(response.status, payload, response.statusText)
  return payload as T
}

/** Sign in and return the session token. daptin returns it as a store.set response. */
export async function signIn(email: string, password: string): Promise<string> {
  const payload = await request<unknown>('/action/user_account/signin', {
    method: 'POST',
    body: { attributes: { email, password } },
    accept: 'application/json',
  })

  const responses = Array.isArray(payload) ? payload : []
  for (const entry of responses as Array<{ ResponseType?: string; Attributes?: { value?: string } }>) {
    if (entry?.ResponseType === 'client.store.set' && entry.Attributes?.value) {
      return entry.Attributes.value
    }
  }
  throw new BackendError(500, 'The backend accepted the request but returned no session token.')
}

export async function loadEntities(token: string): Promise<Entity[]> {
  const payload = await request<unknown>('/api/world?page[size]=500&sort=table_name', { token })
  return parseEntities(payload)
}

export async function loadRecords(
  token: string,
  table: string,
  options: { page?: number; size?: number } = {},
): Promise<RecordPage> {
  const payload = await request<{
    data?: Array<{ id?: string; attributes?: Record<string, unknown> }>
    links?: { total?: number; last_page?: number }
  }>(buildListUrl(table, options), { token })

  const rows: RecordRow[] = (payload?.data ?? []).map((row) => ({
    id: String(row.id ?? ''),
    // daptin puts the id on the resource, not in its attributes; the ledger
    // reads every column through `attributes`, so carry it across.
    attributes: { ...row.attributes, id: String(row.id ?? '') },
  }))

  return {
    rows,
    total: payload?.links?.total ?? rows.length,
    lastPage: payload?.links?.last_page ?? 1,
  }
}

export async function createRecord(
  token: string,
  table: string,
  attributes: Record<string, unknown>,
): Promise<RecordRow> {
  const payload = await request<{ data?: { id?: string; attributes?: Record<string, unknown> } }>(
    `/api/${table}`,
    { method: 'POST', token, body: { data: { type: table, attributes } } },
  )
  return { id: String(payload?.data?.id ?? ''), attributes: payload?.data?.attributes ?? {} }
}

export async function deleteRecord(token: string, table: string, id: string): Promise<void> {
  await request<unknown>(`/api/${table}/${id}`, { method: 'DELETE', token })
}
