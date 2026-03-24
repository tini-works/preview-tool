import { useForm } from 'react-hook-form'

interface CheckoutForm {
  name: string
  email: string
  cardNumber: string
}

export default function Checkout() {
  const { register, handleSubmit, formState: { isDirty, isSubmitting, errors } } = useForm<CheckoutForm>()

  const onSubmit = (data: CheckoutForm) => {
    void data
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} placeholder="Name" />
      {errors.name && <span>{errors.name.message}</span>}

      <input {...register('email')} placeholder="Email" />
      {errors.email && <span>{errors.email.message}</span>}

      <input {...register('cardNumber')} placeholder="Card number" />

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Processing...' : 'Pay now'}
      </button>

      {isDirty && <p>You have unsaved changes</p>}
    </form>
  )
}
