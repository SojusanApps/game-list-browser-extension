/**
 * Fields that may carry a game's id on a collection view, in the order they are tried. UNVERIFIED against a real
 * response: Nintendo answers a field the schema does not have with INVALID_PARAM / 1802, and then the next is tried.
 */
export const COLLECTION_ID_FIELDS = ["nsUid", "applicationId"] as const;
export type CollectionIdField = (typeof COLLECTION_ID_FIELDS)[number];

/** Collection ("Virtual Game Card") query; trimmed to the fields a game list needs. */
export const collectionQuery = (idField: CollectionIdField) => `query getVgcsVgcs(
  $idToken: String!
  $isHidden: Boolean!
  $country: CountryCode!
  $language: LanguageCode!
  $shopId: Int!
  $limit: Int!
  $nasLanguage: String!
  $offset: Int!
  $order: RequestableVgcViewOrder!
  $sortBy: RequestableVgcViewSortBy!
  $vgcViewType: VgcViewTypeInput
  $vgcViewStatus: VgcViewStatusInput
) @inContext(country: $country, language: $language, shopId: $shopId) {
  account {
    vgc {
      vgcViews(
        idToken: $idToken,
        limit: $limit,
        nasLanguage: $nasLanguage,
        offset: $offset,
        order: $order,
        sortBy: $sortBy,
        isHidden: $isHidden,
        vgcViewType: $vgcViewType,
        vgcViewStatus: $vgcViewStatus,
      ) {
        offsetInfo {
          total
          offset
        }
        views {
          id
          ${idField}
          applicationName
        }
      }
    }
  }
}`;
