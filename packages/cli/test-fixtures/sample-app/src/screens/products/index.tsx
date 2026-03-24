import { useQuery } from '@tanstack/react-query'

interface Product {
  id: string
  name: string
  price: number
}

export default function Products() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: async (): Promise<Product[]> => {
      const res = await fetch('/api/products')
      return res.json()
    },
  })

  if (isLoading) return <div>Loading products...</div>
  if (error) return <div>Failed to load products</div>

  return (
    <ul>
      {(data as Product[] | undefined)?.map(p => (
        <li key={p.id}>{p.name} — ${p.price}</li>
      ))}
    </ul>
  )
}
