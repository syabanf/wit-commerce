import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveStore, storeHostUrl } from '../../../apps/storefront/src/lib/host.ts'
import { makePaths } from '../../../apps/storefront/src/lib/paths.ts'
import { storeHost, storeOrigin } from '../src/storeUrl.ts'

describe('store hosts', () => {
  it('reads the store from a host under the root', () => {
    assert.equal(resolveStore('lari.commerce.reddie.id', 'commerce.reddie.id'), 'lari')
    assert.equal(resolveStore('Aruna.Commerce.Reddie.id', 'commerce.reddie.id'), 'aruna')
    assert.equal(resolveStore('lari.localhost', 'localhost:5375'), 'lari')
    assert.equal(resolveStore('lari.localhost:5375', 'localhost:5375'), 'lari')
  })

  it('finds no store on the root, www, deeper names or other domains', () => {
    assert.equal(resolveStore('commerce.reddie.id', 'commerce.reddie.id'), null)
    assert.equal(resolveStore('www.commerce.reddie.id', 'commerce.reddie.id'), null)
    assert.equal(resolveStore('a.lari.commerce.reddie.id', 'commerce.reddie.id'), null)
    assert.equal(resolveStore('lari.evilcommerce.reddie.id', 'commerce.reddie.id'), null)
    assert.equal(resolveStore('localhost', 'localhost:5375'), null)
    assert.equal(resolveStore('lari.commerce.reddie.id', null), null)
  })

  it('builds store addresses, with http only for localhost', () => {
    assert.equal(storeHost({ subdomain: 'lari' }), 'lari.commerce.reddie.id')
    assert.equal(storeOrigin({ subdomain: 'lari' }), 'https://lari.commerce.reddie.id')
    assert.equal(storeOrigin({ subdomain: 'lari' }, 'localhost:5375'), 'http://lari.localhost:5375')
  })

  it('moves old path URLs to the store host', () => {
    assert.equal(
      storeHostUrl('/lari/p/prd-1', 'commerce.reddie.id'),
      'https://lari.commerce.reddie.id/p/prd-1',
    )
    assert.equal(storeHostUrl('/lari', 'commerce.reddie.id'), 'https://lari.commerce.reddie.id/')
    assert.equal(storeHostUrl('/', 'commerce.reddie.id'), null)
    assert.equal(storeHostUrl('', 'commerce.reddie.id'), null)
  })
})

describe('storefront paths', () => {
  const host = makePaths(true)
  const path = makePaths(false)

  it('puts a store host at the root', () => {
    assert.equal(host.home('lari'), '/')
    assert.equal(host.product('lari', 'prd-1'), '/p/prd-1')
    assert.equal(host.seller('lari', 'fahmi'), '/fahmi')
    assert.equal(host.search('lari', 'tas', { sort: 'best' }), '/search?q=tas&sort=best')
  })

  it('keeps every store under its subdomain on a single host', () => {
    assert.equal(path.home('lari'), '/lari')
    assert.equal(path.product('lari', 'prd-1'), '/lari/p/prd-1')
    assert.equal(path.seller('lari', 'fahmi'), '/lari/fahmi')
    assert.equal(path.order('lari', 'ord-1'), '/lari/order/ord-1')
    assert.equal(path.search('lari'), '/lari/search')
  })
})
