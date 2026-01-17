# Vector Utils Test Suite

## Overview

Comprehensive test suite for vector embeddings utilities in the PharmabrokerWhatsApp system.

## Test Results

✅ **36 tests passing** across 3 main categories

## Test Coverage

### 1. Vector String Conversion (11 tests)

Tests for converting between JavaScript arrays and pgvector string format.

**toVectorString:**

- ✅ Convert number array to vector string
- ✅ Handle empty array
- ✅ Handle single element
- ✅ Handle floating point numbers
- ✅ Handle negative numbers

**fromVectorString:**

- ✅ Parse vector string to number array
- ✅ Handle empty vector string
- ✅ Handle single element
- ✅ Handle floating point numbers
- ✅ Handle negative numbers

**Round-trip conversion:**

- ✅ Maintain values through round-trip conversion

### 2. Cosine Similarity (8 tests)

Tests for calculating similarity between vectors.

- ✅ Return 1 for identical vectors
- ✅ Return 0 for orthogonal vectors
- ✅ Return -1 for opposite vectors
- ✅ Handle normalized vectors
- ✅ Throw error for vectors of different lengths
- ✅ Handle zero vectors (returns NaN)
- ✅ Be commutative (sim(a,b) = sim(b,a))
- ✅ Handle high-dimensional vectors (768 dimensions)

### 3. Database Integration (17 tests)

Tests for database operations with vector embeddings.

**updateMessageEmbedding:**

- ✅ Update message with embedding
- ✅ 768-dimensional vectors (tested via other integration tests)

**upsertMessageEmbedding:**

- ✅ Create new message embedding
- ✅ Update existing message embedding
- ✅ Allow multiple embeddings with different types

**semanticSearchMessages:**

- ✅ Find similar messages
- ✅ Respect similarity threshold
- ✅ Respect limit parameter
- ✅ Filter by sessionId
- ✅ Filter by groupId
- ✅ Return results ordered by similarity

**semanticSearchEmbeddings:**

- ✅ Find similar embeddings
- ✅ Filter by embedding type
- ✅ Filter by model

**findSimilarMessages:**

- ✅ Find similar messages to a given message
- ✅ Respect similarity threshold
- ✅ Respect limit parameter
- ✅ Return results ordered by similarity

## Running the Tests

```bash
# Run all tests
cd packages/db/src
bun test vector-utils.test.ts

# Run with verbose output
bun test vector-utils.test.ts --verbose

# Run specific test
bun test vector-utils.test.ts -t "should find similar messages"
```

## Test Database

Tests use the same database as development:

- Database: `pharmabroker`
- Connection: `postgresql://postgres:password@localhost:5432/pharmabroker`
- Extension: `pgvector` (automatically enabled)

## Test Data Cleanup

- Test data is automatically cleaned up after each test
- Test users have email prefix `test-`
- All test data is removed in `afterAll` hook

## Performance

- Total test execution time: ~600ms
- Average test time: ~17ms
- Database operations: ~15-32ms each

## Notes

1. **Vector Dimensions**: All tests use 768-dimensional vectors, compatible with common embedding models
2. **Similarity Threshold**: Tests use various thresholds (0.5, 0.7, 0.8, 0.95) to validate filtering
3. **Database State**: Tests create isolated test data and clean up after execution
4. **Timeout Handling**: Database integration tests have appropriate timeouts (5s for cleanup)

## Future Improvements

- [ ] Add property-based tests for vector operations
- [ ] Add performance benchmarks for large datasets
- [ ] Test vector index performance (IVFFlat, HNSW)
- [ ] Add tests for batch embedding operations
- [ ] Test error handling for malformed vectors
