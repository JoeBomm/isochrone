export const schema = gql`
  type Location {
    id: ID!
    name: String!
    latitude: Float!
    longitude: Float!
  }

  type Coordinate {
    latitude: Float!
    longitude: Float!
  }

  input LocationInput {
    name: String!
    latitude: Float!
    longitude: Float!
  }

  input CoordinateInput {
    latitude: Float!
    longitude: Float!
  }

  type Query {
    geocodeAddress(address: String!): Coordinate @skipAuth
  }
`