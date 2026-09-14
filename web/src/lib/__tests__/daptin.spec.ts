import { describe, expect, it } from 'vitest'

import {
  BackendError,
  buildListUrl,
  editableColumns,
  isNumeric,
  isRequired,
  parseEntities,
  parseErrorMessage,
  type Entity,
} from '../daptin'

const worldResponse = {
  data: [
    {
      attributes: {
        table_name: 'products',
        is_top_level: true,
        is_hidden: false,
        is_join_table: false,
        icon: 'fa-box',
        world_schema_json: JSON.stringify({
          TableName: 'products',
          Columns: [
            { ColumnName: 'id', ColumnType: 'id', DataType: 'int(11)' },
            // daptin sets an empty ForeignKeyData on plain columns too.
            {
              ColumnName: 'name',
              ColumnType: 'label',
              DataType: 'varchar(200)',
              IsForeignKey: false,
              ForeignKeyData: { DataSource: '', Namespace: '', KeyName: '' },
            },
            {
              ColumnName: 'price',
              ColumnType: 'measurement',
              DataType: 'int',
              IsForeignKey: false,
              ForeignKeyData: { DataSource: '', Namespace: '', KeyName: '' },
            },
            {
              ColumnName: 'note',
              ColumnType: 'text',
              DataType: 'text',
              IsNullable: true,
              ForeignKeyData: { DataSource: '', Namespace: '', KeyName: '' },
            },
            {
              ColumnName: 'owner',
              ColumnType: 'label',
              DataType: 'int(11)',
              IsForeignKey: true,
              ForeignKeyData: { DataSource: 'self', Namespace: 'user_account', KeyName: 'id' },
            },
          ],
        }),
      },
    },
    {
      attributes: {
        table_name: 'world_world_id_has_usergroup_usergroup_id',
        is_join_table: true,
        world_schema_json: '{}',
      },
    },
    {
      attributes: { table_name: 'internal', is_hidden: true, world_schema_json: '{}' },
    },
    {
      attributes: {
        table_name: 'action',
        is_top_level: false,
        world_schema_json: 'not json at all',
      },
    },
  ],
}

describe('parseEntities', () => {
  it('keeps user-facing tables and drops join and hidden tables', () => {
    const names = parseEntities(worldResponse).map((entity) => entity.name)
    expect(names).toEqual(['action', 'products'])
  })

  it('reads column definitions and survives an unparseable schema', () => {
    const entities = parseEntities(worldResponse)
    const products = entities.find((entity) => entity.name === 'products')
    expect(products?.isTopLevel).toBe(true)
    expect(products?.columns.map((column) => column.name)).toEqual([
      'id',
      'name',
      'price',
      'note',
      'owner',
    ])
    expect(products?.columns.find((column) => column.name === 'note')?.nullable).toBe(true)
    expect(entities.find((entity) => entity.name === 'action')?.columns).toEqual([])
  })

  it('returns nothing for an unexpected payload', () => {
    expect(parseEntities(null)).toEqual([])
    expect(parseEntities({ data: 'nope' })).toEqual([])
  })
})

describe('editableColumns', () => {
  const products = parseEntities(worldResponse)[1] as Entity

  it('keeps simple columns and drops system and relation columns', () => {
    // `name` and `price` carry an empty ForeignKeyData from daptin; they must
    // stay editable. Only IsForeignKey + DataSource "self" marks a relation.
    expect(editableColumns(products).map((column) => column.name)).toEqual(['name', 'price', 'note'])
  })

  it('marks a column without a default as required and reports numerics', () => {
    const [name, price, note] = editableColumns(products)
    expect(isRequired(name!)).toBe(true)
    expect(isRequired(note!)).toBe(false)
    expect(isNumeric(price!)).toBe(true)
    expect(isNumeric(name!)).toBe(false)
  })
})

describe('buildListUrl', () => {
  it('applies defaults', () => {
    expect(buildListUrl('products')).toBe('/api/products?page%5Bnumber%5D=1&page%5Bsize%5D=25')
  })

  it('carries page, size and sort', () => {
    const url = buildListUrl('products', { page: 3, size: 10, sort: '-created_at' })
    expect(url).toContain('page%5Bnumber%5D=3')
    expect(url).toContain('page%5Bsize%5D=10')
    expect(url).toContain('sort=-created_at')
  })
})

describe('parseErrorMessage', () => {
  it('reads a JSON:API error object', () => {
    const error = parseErrorMessage(403, { errors: [{ title: 'obj access', detail: 'denied' }] })
    expect(error).toBeInstanceOf(BackendError)
    expect(error.status).toBe(403)
    expect(error.message).toBe('denied')
    expect(error.hint).toMatch(/not allowed/)
  })

  it('reads a daptin notify array', () => {
    const error = parseErrorMessage(500, [
      { ResponseType: 'client.notify', Attributes: { message: 'Invalid username or password' } },
    ])
    expect(error.message).toBe('Invalid username or password')
    expect(error.hint).toBeUndefined()
  })

  it('falls back to the status text', () => {
    expect(parseErrorMessage(418, null, "I'm a teapot").message).toBe("I'm a teapot")
    expect(parseErrorMessage(500, null).message).toMatch(/status 500/)
  })
})
