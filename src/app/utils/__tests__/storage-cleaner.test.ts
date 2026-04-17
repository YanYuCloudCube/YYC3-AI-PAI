/**
 * @file storage-cleaner.test.ts
 * @description 存储清理工具测试
 * @author YanYuCloudCube Team <admin@0379.email>
 * @version v1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StorageCleaner } from '../storage-cleaner'

describe('StorageCleaner', () => {
  let cleaner: StorageCleaner

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    const AnySC = StorageCleaner as unknown as { instance: StorageCleaner | null }
    AnySC.instance = null
    cleaner = StorageCleaner.getInstance()
  })

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const a = StorageCleaner.getInstance()
      const b = StorageCleaner.getInstance()
      expect(a).toBe(b)
    })
  })

  describe('cleanExpiredCache', () => {
    it('should remove expired cache entries', async () => {
      const now = Date.now()
      localStorage.setItem('yyc3_expired', JSON.stringify({
        timestamp: now - 10000,
        ttl: 5000,
        data: 'old',
      }))
      localStorage.setItem('yyc3_valid', JSON.stringify({
        timestamp: now,
        ttl: 60000,
        data: 'fresh',
      }))

      const result = await cleaner.cleanExpiredCache()

      expect(result.cleaned).toBe(1)
      expect(localStorage.getItem('yyc3_expired')).toBeNull()
      expect(localStorage.getItem('yyc3_valid')).toBeTruthy()
    })

    it('should skip non-JSON entries', async () => {
      localStorage.setItem('yyc3_plain', 'not-json')

      const result = await cleaner.cleanExpiredCache()
      expect(result.errors).toHaveLength(0)
    })

    it('should skip entries without timestamp/ttl', async () => {
      localStorage.setItem('yyc3_no_ttl', JSON.stringify({ data: 'value' }))

      const result = await cleaner.cleanExpiredCache()
      expect(result.cleaned).toBe(0)
    })

    it('should support dryRun mode', async () => {
      const now = Date.now()
      localStorage.setItem('yyc3_expired', JSON.stringify({
        timestamp: now - 10000,
        ttl: 5000,
      }))

      const result = await cleaner.cleanExpiredCache({ dryRun: true })

      expect(result.cleaned).toBe(1)
      expect(localStorage.getItem('yyc3_expired')).toBeTruthy()
    })

    it('should calculate freedBytes', async () => {
      const now = Date.now()
      localStorage.setItem('yyc3_expired', JSON.stringify({
        timestamp: now - 10000,
        ttl: 5000,
        data: 'some data to free',
      }))

      const result = await cleaner.cleanExpiredCache()
      expect(result.freedBytes).toBeGreaterThan(0)
    })

    it('should only clean yyc3_ prefixed keys', async () => {
      const now = Date.now()
      localStorage.setItem('other_expired', JSON.stringify({
        timestamp: now - 10000,
        ttl: 5000,
      }))

      const result = await cleaner.cleanExpiredCache()
      expect(result.cleaned).toBe(0)
    })
  })

  describe('cleanOldData', () => {
    it('should remove entries older than maxAge', async () => {
      const now = Date.now()
      localStorage.setItem('yyc3_old', JSON.stringify({
        timestamp: now - 200000,
      }))
      localStorage.setItem('yyc3_recent', JSON.stringify({
        timestamp: now - 1000,
      }))

      const result = await cleaner.cleanOldData(100000)

      expect(result.cleaned).toBe(1)
      expect(localStorage.getItem('yyc3_old')).toBeNull()
      expect(localStorage.getItem('yyc3_recent')).toBeTruthy()
    })

    it('should support dryRun mode', async () => {
      const now = Date.now()
      localStorage.setItem('yyc3_old', JSON.stringify({
        timestamp: now - 200000,
      }))

      const result = await cleaner.cleanOldData(100000, { dryRun: true })

      expect(result.cleaned).toBe(1)
      expect(localStorage.getItem('yyc3_old')).toBeTruthy()
    })
  })

  describe('cleanLowPriorityData', () => {
    it('should remove low priority keys', async () => {
      localStorage.setItem('yyc3_file_store', JSON.stringify({ data: 'files' }))
      localStorage.setItem('yyc3_query_history', JSON.stringify({ data: 'queries' }))
      localStorage.setItem('yyc3_activity_log', JSON.stringify({ data: 'logs' }))
      localStorage.setItem('yyc3_settings', JSON.stringify({ theme: 'dark' }))

      const result = await cleaner.cleanLowPriorityData()

      expect(result.cleaned).toBe(3)
      expect(localStorage.getItem('yyc3_file_store')).toBeNull()
      expect(localStorage.getItem('yyc3_query_history')).toBeNull()
      expect(localStorage.getItem('yyc3_activity_log')).toBeNull()
      expect(localStorage.getItem('yyc3_settings')).toBeTruthy()
    })

    it('should support dryRun mode', async () => {
      localStorage.setItem('yyc3_file_store', JSON.stringify({ data: 'files' }))

      const result = await cleaner.cleanLowPriorityData({ dryRun: true })

      expect(result.cleaned).toBe(1)
      expect(localStorage.getItem('yyc3_file_store')).toBeTruthy()
    })

    it('should only count existing low priority keys in dryRun', async () => {
      localStorage.setItem('yyc3_file_store', JSON.stringify({ data: 'files' }))

      const result = await cleaner.cleanLowPriorityData({ dryRun: true })

      expect(result.cleaned).toBe(1)
    })
  })

  describe('cleanAll', () => {
    it('should remove all yyc3_ prefixed entries', async () => {
      localStorage.setItem('yyc3_settings', JSON.stringify({ theme: 'dark' }))
      localStorage.setItem('yyc3_data', JSON.stringify({ value: 42 }))
      localStorage.setItem('other_key', 'keep')

      const result = await cleaner.cleanAll()

      expect(result.cleaned).toBe(2)
      expect(localStorage.getItem('yyc3_settings')).toBeNull()
      expect(localStorage.getItem('yyc3_data')).toBeNull()
      expect(localStorage.getItem('other_key')).toBe('keep')
    })

    it('should report freedBytes', async () => {
      localStorage.setItem('yyc3_data', JSON.stringify({ value: 'test' }))

      const result = await cleaner.cleanAll()
      expect(result.freedBytes).toBeGreaterThan(0)
    })
  })

  describe('scheduleAutoClean / cancelAutoClean', () => {
    it('should schedule and cancel auto clean', () => {
      cleaner.scheduleAutoClean(60000)
      cleaner.cancelAutoClean()
    })

    it('should replace existing schedule', () => {
      cleaner.scheduleAutoClean(60000)
      cleaner.scheduleAutoClean(30000)
      cleaner.cancelAutoClean()
    })
  })
})
