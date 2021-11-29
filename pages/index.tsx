import { Button } from '@chakra-ui/button'
import { Checkbox } from '@chakra-ui/checkbox'
import { FormControl, FormHelperText, FormLabel } from '@chakra-ui/form-control'
import { Input } from '@chakra-ui/input'
import { Center, Code, Container, Link, Stack } from '@chakra-ui/layout'
import { Radio, RadioGroup } from '@chakra-ui/radio'
import { Text, useToast } from '@chakra-ui/react'
import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import React, { ChangeEventHandler, FormEventHandler, useState } from 'react'
import { getWorkerOrigin } from '../lib/workerHelpers'

const Home: NextPage = () => {
  const [loading, setLoading] = useState(false)
  const [question, setQuestion] = useState<string>('')
  const [choices, setChoices] = useState<string[]>(['', ''])
  const [dedup, setDedup] = useState('ip')
  const [multiOk, setMultiOk] = useState(false)
  const toast = useToast()
  const router = useRouter()

  const onSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    setLoading(() => true)
    try {
      const apiOrigin = getWorkerOrigin()
      const body = JSON.stringify({ question, choices, dedup, multiOk })
      const response = await fetch(apiOrigin + '/api/poll', { method: 'POST', body })

      if (!response.ok) {
        console.error('failed to create a poll', response)
        throw response
      }
      // redirect to the poll
      const pollId = await response.text()
      router.push(`/${pollId}`)
    } catch (error) {
      // no-op
      if (!toast.isActive('poll-create')) {
        toast({
          id: 'poll-create',
          title: 'Failed to create a poll',
          status: 'error',
          isClosable: true,
        })
      }
    } finally {
      setLoading(() => false)
    }
  }

  const onChangeQuestion: ChangeEventHandler<HTMLInputElement> = (event) => {
    setQuestion(() => event.target.value)
  }

  const onChangeChoiceHandler = (index: number): ChangeEventHandler<HTMLInputElement> => (event) => {
    setChoices(currentChoices => {
      const choiceValue = event.target.value
      const modifiedChoices = [...currentChoices.slice(0, index), choiceValue, ...currentChoices.slice(index + 1)]
        // If a choice is the empty string, remove it
        .filter((modifiedChoice, index) => index < 2 || !!modifiedChoice)

      // if the last choice is truthy, add a new empty choice
      if (modifiedChoices[0] && !!modifiedChoices[modifiedChoices.length - 1]) {
        modifiedChoices.push('')
      }

      return modifiedChoices
    })
  }

  const onChangeMultiOk: ChangeEventHandler<HTMLInputElement> = (event) => {
    setMultiOk(() => event.target.checked)
  }

  return (
    <Container>
      <Center minHeight='90vh'>
        <form onSubmit={onSubmit}>
          <FormControl isRequired isReadOnly={loading} isDisabled={loading}>
            <FormLabel>Question</FormLabel>
            <Input value={question} onChange={onChangeQuestion} placeholder='Type your question here' />
            <FormHelperText>What question are your participants going to answer?</FormHelperText>
          </FormControl>

          <Stack direction='column' pt='1em' spacing='0.5em'>
            {choices.map((choice, index) =>
              <FormControl key={index} isRequired={index < 2} isReadOnly={loading} isDisabled={loading}>
                <FormLabel>Poll option {index + 1}</FormLabel>
                <Input value={choice} onChange={onChangeChoiceHandler(index)} placeholder='Enter poll option' />
              </FormControl>
            )}
          </Stack>

          <FormControl pt='1em' isReadOnly={loading} isDisabled={loading}>
            <FormLabel>Participant Duplication Check</FormLabel>
            <RadioGroup onChange={setDedup} value={dedup} defaultValue='ip'>
              <Stack>
                <Radio value='ip'>IP Duplication Checking</Radio>
                <Radio value='none'>No Duplication Checking</Radio>
              </Stack>
            </RadioGroup>
            <FormHelperText>
              If <Code>IP Duplication Checking</Code> is selected, each submission must have a unique IP address. Otherwise, participants may submit as many responses as they like.
            </FormHelperText>
          </FormControl>

          <FormControl pt='1em' isReadOnly={loading} isDisabled={loading}>
            <Checkbox isChecked={multiOk} onChange={onChangeMultiOk} isDisabled={loading}>Allow multiple poll answers?</Checkbox>
            <FormHelperText>If enabled, participants can select and submit multiple answers.</FormHelperText>
          </FormControl>

          <Stack pt='1em'>
            <Button type='submit' isLoading={loading} loadingText='Submitting'>Submit</Button>
          </Stack>
        </form>
      </Center>
      <Text>Polls will be removed 24 hours after creation. Source code is available at <Link isExternal href='https://github.com/awwong1/poll.udia.ca'>https://github.com/awwong1/poll.udia.ca</Link></Text>
    </Container>
  )
}

export default Home
