// Test setup file for backend
import { beforeAll, afterAll } from 'vitest'

beforeAll(async () => {
  // Setup test environment
  process.env.NODE_ENV = 'test'
})

afterAll(async () => {
  // Cleanup after tests
})