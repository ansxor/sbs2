// The frozen shared contract (ARCHITECTURE §3). Every layer imports entity/API/route
// shapes from here; no agent redeclares an entity shape locally. Entities are MUTABLE
// transport DTOs, not immutable React state.
export {};
