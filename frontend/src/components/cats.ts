export const CAT_KINDS = ['black', 'orange', 'white', 'rainbow'] as const
export type CatKind = (typeof CAT_KINDS)[number]

/** One of the four cats, at random (the edge cat's colour for each visit). */
export const randomCat = (): CatKind => CAT_KINDS[Math.floor(Math.random() * CAT_KINDS.length)] ?? 'orange'
