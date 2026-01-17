import { GraphQLScalarType, GraphQLError } from 'graphql'
import { Kind } from 'graphql/language'

// Custom scalar for GeoJSON Polygon
export const GeoJSONPolygon = new GraphQLScalarType({
  name: 'GeoJSONPolygon',
  description: 'A GeoJSON Polygon object',
  serialize(value: any) {
    // Serialize the polygon for output
    if (value && typeof value === 'object' && value.type === 'Polygon') {
      return value
    }
    throw new GraphQLError('Value must be a valid GeoJSON Polygon')
  },
  parseValue(value: any) {
    // Parse input from variables
    if (value && typeof value === 'object' && value.type === 'Polygon') {
      return value
    }
    throw new GraphQLError('Value must be a valid GeoJSON Polygon')
  },
  parseLiteral(ast) {
    // Parse input from query literals
    if (ast.kind === Kind.OBJECT) {
      // For now, we'll accept any object literal
      // In a production app, you'd want more validation here
      return ast
    }
    throw new GraphQLError('Value must be a valid GeoJSON Polygon')
  },
})

export const schema = gql`
  scalar GeoJSONPolygon
`