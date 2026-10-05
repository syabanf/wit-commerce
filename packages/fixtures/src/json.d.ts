// The seed JSON is large; declaring it as unknown keeps the type checker from inferring
// a structural type for every record. data.ts casts it to AppState once.
declare module '*.json' {
  const value: unknown
  export default value
}
