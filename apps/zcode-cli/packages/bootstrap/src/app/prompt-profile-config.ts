export function promptProfilesFromLoadedConfig<T>(input: {
  override?: readonly T[];
  loaded?: readonly T[];
}): readonly T[] | undefined {
  return input.override ?? input.loaded;
}
