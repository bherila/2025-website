import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const formSchema = z.object({
  itemsList: z.string().min(1, 'At least one item is required'),
  activateFreeSpace: z.boolean().default(false),
  numCards: z.number().min(1, 'Must generate at least 1 card').max(1000, 'Maximum of 1000 cards allowed'),
})

export type BingoData = z.infer<typeof formSchema>

const BingoForm = (props: { onSubmit: (data: BingoData) => void }) => {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<BingoData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      itemsList: Array.from({ length: 99 }, (_, i) => i.toString()).join('\n'),
      activateFreeSpace: false,
      numCards: 10,
    },
  })

  const onSubmit = (data: BingoData) => {
    props.onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mx-auto">
      <Controller
        name="activateFreeSpace"
        control={control}
        render={({ field }) => (
          <div className="flex items-center space-x-2">
            <Checkbox id="activateFreeSpace" checked={field.value} onCheckedChange={field.onChange} />
            <Label htmlFor="activateFreeSpace">Activate free space?</Label>
          </div>
        )}
      />

      <div className="space-y-2">
        <Label htmlFor="itemsList">List of items</Label>
        <Controller
          name="itemsList"
          control={control}
          render={({ field }) => <Textarea {...field} id="itemsList" rows={3} className="min-h-[100px]" />}
        />
        {errors.itemsList && <p className="text-sm text-red-500">{errors.itemsList.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="numCards">Number of cards to generate</Label>
        <Controller
          name="numCards"
          control={control}
          render={({ field }) => (
            <Input {...field} id="numCards" type="number" onChange={(e) => field.onChange(parseInt(e.target.value))} />
          )}
        />
        {errors.numCards && <p className="text-sm text-red-500">{errors.numCards.message}</p>}
      </div>

      <Button type="submit" className="w-full">
        Generate Bingo Cards
      </Button>
    </form>
  )
}

export default BingoForm
