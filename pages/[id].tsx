import { Button } from '@chakra-ui/button'
import { Center, Container, Stack } from '@chakra-ui/layout'
import { Radio, RadioGroup } from '@chakra-ui/radio'
import { Alert, AlertDescription, AlertIcon, AlertTitle, Checkbox, Skeleton, Spinner, Text, useToast } from '@chakra-ui/react'
import { NextPage } from 'next'
import { useRouter } from 'next/router'
import { stringify } from 'querystring'
import React, { ChangeEventHandler, FormEventHandler, useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getWorkerSocketOrigin } from '../lib/workerHelpers'

interface SocketPollPayload {
  question: string
  choices: string[]
  dedup: 'ip' | 'none'
  multiOk: boolean
  counts: { value: string, count: number }[]
}

interface SocketCounts {
  counts: { value: string, count: number }[]
}

interface SocketError {
  error: string
}

type SocketEvent = SocketPollPayload | SocketCounts | SocketError

const Poll: NextPage = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [question, setQuestion] = useState('')
  const [choices, setChoices] = useState<string[]>([])
  const [multiOk, setMultiOk] = useState(false)
  const [answers, setAnswers] = useState<string[]>([])
  const [counts, setCounts] = useState<{ value: string, count: number }[]>([])
  const [resetWsListeners, setResetWsListeners] = useState(false)
  const toast = useToast()
  const router = useRouter()
  const { id } = router.query

  const wsRef = useRef<WebSocket | null>(null)
  useEffect(() => {
    if (!id) { return }
    if (wsRef.current === null) {
      const ws = new WebSocket(getWorkerSocketOrigin() + '/api/socket/' + id)
      wsRef.current = ws
      setResetWsListeners(true)
      return () => {
        wsRef.current = null
        ws.close(1000, 'component unmounting')
      }
    }
  }, [id])

  useEffect(() => {
    const ws = wsRef.current
    if (!id || !ws || !resetWsListeners) {
      return
    }
    ws.addEventListener('open', event => {
      ws.send(JSON.stringify({ id }))
    })

    ws.addEventListener('message', event => {
      let data: SocketEvent = JSON.parse(event.data)
      if ('error' in data) {
        setError(data.error)
        console.error(data.error)
      } else if ('question' in data) {
        setQuestion(data.question)
        setChoices(data.choices)
        setMultiOk(data.multiOk)
        setCounts(data.counts)
        console.log(data)
      } else if ('counts' in data) {
        console.log(data.counts)
        setCounts(data.counts)
      }
      setLoading(false)
    })

    ws.addEventListener('close', event => {
      if (event.reason === 'component unmounting') {
        return
      }
      console.log('WebSocket closed', event)
      wsRef.current = new WebSocket(getWorkerSocketOrigin() + '/api/socket/' + id)
      setResetWsListeners(true)
    })

    ws.addEventListener('error', event => {
      console.log('WebSocket errored', event)
      wsRef.current = new WebSocket(getWorkerSocketOrigin() + '/api/socket/' + id)
      setResetWsListeners(true)
    })

    setResetWsListeners(false)
  }, [id, resetWsListeners])

  const onSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    if (answers.length <= 0 && !toast.isActive('must-select-one')) {
      toast({
        id: 'must-select-one',
        title: 'Please select response before submitting',
        status: 'error',
        isClosable: true
      })
      return
    }
    setSubmitting(true)
    try {
      const ws = wsRef.current
      if (!ws) {
        throw 'WebSocket reference does not exist'
      }

      ws.send(JSON.stringify({ answers: answers.map((ans) => parseInt(ans)) }))
    } catch (error) {
      if (!toast.isActive('poll-submit')) {
        toast({
          id: 'poll-submit',
          title: 'Failed to submit poll answers',
          status: 'error',
          isClosable: true
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const onChangeMultiChoiceHandler = (choiceValue: string): ChangeEventHandler<HTMLInputElement> => event => {
    const checked = event.target.checked
    setAnswers((curAnswers) => {
      if (checked) {
        return [...curAnswers, choiceValue]
      } else {
        const idx = curAnswers.indexOf(choiceValue)
        return [...curAnswers.slice(0, idx), ...curAnswers.slice(idx + 1)]
      }
    })

  }

  const onChangeSingleChoice = (choiceValue: string) => {
    setAnswers(() => [choiceValue])
  }

  return <Container>
    <Center minHeight='90vh'>
      <Stack direction='column'>
        {error && <Alert status='error'>
          <AlertIcon />
          <AlertTitle mr={2}>{error}</AlertTitle>
        </Alert>}
        {loading && <Spinner
          thickness='4px'
          speed='0.65s'
          emptyColor='gray.200'
          color='blue.500'
          size='xl'
        />}
        {!loading &&
          <BarChart
            width={500}
            height={300}
            data={counts}
          >
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey='name' />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey='count' fill='#663399' />
          </BarChart>}
        {loading && <Skeleton />}
        {!loading && <Stack direction='column'>
          <Text>{question}</Text>
          <form onSubmit={onSubmit}>
            <Stack direction='column' pt='1em' spacing='0.5em'>
              {!!multiOk && <Stack>
                {choices.map((choice, index) =>
                  <Checkbox key={index}
                    isChecked={answers.indexOf(index.toString()) >= 0}
                    onChange={onChangeMultiChoiceHandler(index.toString())}
                    isDisabled={submitting}
                  >
                    {choice}
                  </Checkbox>
                )}
              </Stack>}
              {!multiOk && <RadioGroup
                value={answers.reduce((_, cur) => cur, '')}
                onChange={onChangeSingleChoice}
                isDisabled={submitting}
              >
                <Stack>
                  {choices.map((choice, index) =>
                    <Radio key={index} value={index.toString()}>{choice}</Radio>
                  )}
                </Stack>
              </RadioGroup>}
            </Stack>
            <Stack pt='1em'>
              <Button type='submit' isLoading={submitting} loadingText='Submitting'>Submit</Button>
            </Stack>
          </form>
        </Stack>}
      </Stack>
    </Center>
  </Container>
}

export default Poll
