/**
 * @file key-manager.ts
 * @description 密钥管理工具，提供安全的密钥存储和管理功能
 * @author YanYuCloudCube Team <admin@0379.email>
 * @version v1.0.0
 * @created 2026-04-07
 * @updated 2026-04-07
 * @status stable
 * @license MIT
 * @copyright Copyright (c) 2026 YanYuCloudCube Team
 * @tags security,encryption,keys,storage
 */

import { createLogger } from './logger'

const logger = createLogger('KeyManager')

export interface EncryptedKey {
  id: string
  provider: string
  encryptedData: string
  iv: string
  salt: string
  createdAt: number
  updatedAt: number
  lastUsed?: number
  metadata?: {
    description?: string
    tags?: string[]
  }
}

export interface KeyInfo {
  id: string
  provider: string
  keyPreview: string
  createdAt: number
  updatedAt: number
  lastUsed?: number
  metadata?: {
    description?: string
    tags?: string[]
  }
}

export interface KeyValidationResult {
  valid: boolean
  error?: string
  latencyMs: number
  provider?: string
}

const STORAGE_KEY = 'yyc3_encrypted_keys'
const MASTER_KEY_KEY = 'yyc3_master_key_hash'

export class KeyManager {
  private static instance: KeyManager
  private masterKey: string | null = null
  private sessionUnlocked = false
  private autoLockTimeout: number | null = null
  private autoLockDelay = 30 * 60 * 1000

  private constructor() { }

  static getInstance(): KeyManager {
    if (!KeyManager.instance) {
      KeyManager.instance = new KeyManager()
    }
    return KeyManager.instance
  }

  async initialize(password: string): Promise<boolean> {
    try {
      const storedHash = localStorage.getItem(MASTER_KEY_KEY)
      const passwordHash = await this.hashPassword(password)

      if (storedHash) {
        if (storedHash !== passwordHash) {
          logger.error('[KeyManager] Invalid master password')
          return false
        }
      } else {
        localStorage.setItem(MASTER_KEY_KEY, passwordHash)
        logger.info('[KeyManager] Master password set')
      }

      this.masterKey = password
      this.sessionUnlocked = true
      this.startAutoLock()

      return true
    } catch (error) {
      logger.error('[KeyManager] Failed to initialize', error)
      return false
    }
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    try {
      const storedHash = localStorage.getItem(MASTER_KEY_KEY)
      const oldHash = await this.hashPassword(oldPassword)

      if (storedHash !== oldHash) {
        logger.error('[KeyManager] Old password is incorrect')
        return false
      }

      const keys = this.loadEncryptedKeys()
      const decryptedKeys: Array<{ id: string; provider: string; key: string; metadata?: Record<string, unknown> }> = []

      for (const encryptedKey of keys) {
        try {
          const decrypted = await this.decryptKey(encryptedKey, oldPassword)
          decryptedKeys.push({
            id: encryptedKey.id,
            provider: encryptedKey.provider,
            key: decrypted,
            metadata: encryptedKey.metadata,
          })
        } catch (error) {
          logger.error(`[KeyManager] Failed to decrypt key ${encryptedKey.id}`, error)
        }
      }

      const newHash = await this.hashPassword(newPassword)
      localStorage.setItem(MASTER_KEY_KEY, newHash)

      this.masterKey = newPassword

      for (const decryptedKey of decryptedKeys) {
        await this.storeKey(decryptedKey.provider, decryptedKey.key, decryptedKey.metadata)
      }

      logger.info('[KeyManager] Master password changed successfully')
      return true
    } catch (error) {
      logger.error('[KeyManager] Failed to change password', error)
      return false
    }
  }

  async storeKey(
    provider: string,
    apiKey: string,
    metadata?: { description?: string; tags?: string[] }
  ): Promise<string> {
    if (!this.masterKey || !this.sessionUnlocked) {
      throw new Error('KeyManager is not unlocked')
    }

    try {
      const keys = this.loadEncryptedKeys()
      const existingIndex = keys.findIndex((k) => k.provider === provider)

      const salt = this.generateSalt()
      const iv = this.generateIV()
      const encryptedData = await this.encryptData(apiKey, this.masterKey, salt, iv)

      const encryptedKey: EncryptedKey = {
        id: existingIndex >= 0 ? keys[existingIndex].id : `key-${Date.now()}`,
        provider,
        encryptedData,
        iv: Array.from(iv).join(','),
        salt: Array.from(salt).join(','),
        createdAt: existingIndex >= 0 ? keys[existingIndex].createdAt : Date.now(),
        updatedAt: Date.now(),
        metadata,
      }

      if (existingIndex >= 0) {
        keys[existingIndex] = encryptedKey
      } else {
        keys.push(encryptedKey)
      }

      this.saveEncryptedKeys(keys)
      logger.info(`[KeyManager] Key stored for provider: ${provider}`)

      return encryptedKey.id
    } catch (error) {
      logger.error('[KeyManager] Failed to store key', error)
      throw error
    }
  }

  async getKey(provider: string): Promise<string | null> {
    if (!this.masterKey || !this.sessionUnlocked) {
      throw new Error('KeyManager is not unlocked')
    }

    try {
      const keys = this.loadEncryptedKeys()
      const encryptedKey = keys.find((k) => k.provider === provider)

      if (!encryptedKey) {
        return null
      }

      const decrypted = await this.decryptKey(encryptedKey, this.masterKey)

      encryptedKey.lastUsed = Date.now()
      this.saveEncryptedKeys(keys)

      this.resetAutoLock()

      return decrypted
    } catch (error) {
      logger.error(`[KeyManager] Failed to get key for ${provider}`, error)
      return null
    }
  }

  async deleteKey(provider: string): Promise<boolean> {
    try {
      const keys = this.loadEncryptedKeys()
      const index = keys.findIndex((k) => k.provider === provider)

      if (index >= 0) {
        keys.splice(index, 1)
        this.saveEncryptedKeys(keys)
        logger.info(`[KeyManager] Key deleted for provider: ${provider}`)
        return true
      }

      return false
    } catch (error) {
      logger.error('[KeyManager] Failed to delete key', error)
      return false
    }
  }

  listKeys(): KeyInfo[] {
    const keys = this.loadEncryptedKeys()
    return keys.map((k) => ({
      id: k.id,
      provider: k.provider,
      keyPreview: '••••••••' + k.encryptedData.slice(-4),
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
      lastUsed: k.lastUsed,
      metadata: k.metadata,
    }))
  }

  isUnlocked(): boolean {
    return this.sessionUnlocked
  }

  lock(): void {
    this.masterKey = null
    this.sessionUnlocked = false
    this.stopAutoLock()
    logger.info('[KeyManager] Session locked')
  }

  async unlock(password: string): Promise<boolean> {
    return this.initialize(password)
  }

  setAutoLockDelay(delayMs: number): void {
    this.autoLockDelay = delayMs
    if (this.sessionUnlocked) {
      this.resetAutoLock()
    }
  }

  private startAutoLock(): void {
    this.stopAutoLock()
    this.autoLockTimeout = window.setTimeout(() => {
      this.lock()
      logger.info('[KeyManager] Auto-locked due to inactivity')
    }, this.autoLockDelay)
  }

  private resetAutoLock(): void {
    if (this.autoLockTimeout) {
      clearTimeout(this.autoLockTimeout)
      this.startAutoLock()
    }
  }

  private stopAutoLock(): void {
    if (this.autoLockTimeout) {
      clearTimeout(this.autoLockTimeout)
      this.autoLockTimeout = null
    }
  }

  private async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(password + 'yyc3-salt')
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  private generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16))
  }

  private generateIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(12))
  }

  private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.slice() as BufferSource,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  }

  private async encryptData(
    data: string,
    password: string,
    salt: Uint8Array,
    iv: Uint8Array
  ): Promise<string> {
    const key = await this.deriveKey(password, salt)
    const encoder = new TextEncoder()
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv.slice() as BufferSource },
      key,
      encoder.encode(data)
    )
    return Array.from(new Uint8Array(encryptedBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  private async decryptKey(encryptedKey: EncryptedKey, password: string): Promise<string> {
    const salt = new Uint8Array(encryptedKey.salt.split(',').map((n) => parseInt(n, 10)))
    const iv = new Uint8Array(encryptedKey.iv.split(',').map((n) => parseInt(n, 10)))
    const encryptedData = new Uint8Array(
      encryptedKey.encryptedData.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    )

    const key = await this.deriveKey(password, salt)
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.slice() as BufferSource },
      key,
      encryptedData
    )

    const decoder = new TextDecoder()
    return decoder.decode(decryptedBuffer)
  }

  private loadEncryptedKeys(): EncryptedKey[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  private saveEncryptedKeys(keys: EncryptedKey[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
    } catch (error) {
      logger.error('[KeyManager] Failed to save keys', error)
    }
  }

  async exportKeys(password: string): Promise<string> {
    if (!this.masterKey || !this.sessionUnlocked) {
      throw new Error('KeyManager is not unlocked')
    }

    const keys = this.loadEncryptedKeys()
    const decryptedKeys: Array<{
      provider: string
      key: string
      metadata?: Record<string, unknown>
    }> = []

    for (const encryptedKey of keys) {
      try {
        const decrypted = await this.decryptKey(encryptedKey, this.masterKey)
        decryptedKeys.push({
          provider: encryptedKey.provider,
          key: decrypted,
          metadata: encryptedKey.metadata,
        })
      } catch (error) {
        logger.error(`[KeyManager] Failed to decrypt key ${encryptedKey.id}`, error)
      }
    }

    const exportData = {
      version: '1.0.0',
      exportedAt: Date.now(),
      keys: decryptedKeys,
    }

    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify(exportData))
    const salt = this.generateSalt()
    const iv = this.generateIV()
    const key = await this.deriveKey(password, salt)
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.slice() as BufferSource }, key, data)

    const result = {
      salt: Array.from(salt).join(','),
      iv: Array.from(iv).join(','),
      data: Array.from(new Uint8Array(encrypted))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
    }

    return JSON.stringify(result)
  }

  async importKeys(encryptedExport: string, password: string): Promise<number> {
    try {
      const { salt, iv, data } = JSON.parse(encryptedExport)
      const saltArray = new Uint8Array(salt.split(',').map((n: string) => parseInt(n, 10)))
      const ivArray = new Uint8Array(iv.split(',').map((n: string) => parseInt(n, 10)))
      const dataArray = new Uint8Array(data.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)))

      const key = await this.deriveKey(password, saltArray)
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivArray.slice() as BufferSource }, key, dataArray.buffer as ArrayBuffer)

      const decoder = new TextDecoder()
      const exportData = JSON.parse(decoder.decode(decrypted))

      if (exportData.version !== '1.0.0') {
        throw new Error('Unsupported export version')
      }

      let imported = 0
      for (const keyData of exportData.keys) {
        try {
          await this.storeKey(keyData.provider, keyData.key, keyData.metadata)
          imported++
        } catch (error) {
          logger.error(`[KeyManager] Failed to import key for ${keyData.provider}`, error)
        }
      }

      logger.info(`[KeyManager] Imported ${imported} keys`)
      return imported
    } catch (error) {
      logger.error('[KeyManager] Failed to import keys', error)
      throw error
    }
  }
}

export const keyManager = KeyManager.getInstance()
