import { Button } from '@chakra-ui/button'
import { Center, Container, Link, Stack } from '@chakra-ui/layout'
import { Radio, RadioGroup } from '@chakra-ui/radio'
import { Alert, AlertIcon, AlertTitle, Checkbox, Skeleton, Spinner, Text, useToast } from '@chakra-ui/react'
import { NextPage } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import React, { ChangeEventHandler, FormEventHandler, useEffect, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts'
import { ImplicitLabelType } from 'recharts/types/component/Label'
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

  // ref for websocket logic
  const wsRef = useRef<WebSocket | null>(null)
  // ref for handle resize responsive chart logic
  const textRef = useRef<HTMLParagraphElement | null>(null)
  const [chartWidth, setChartWidth] = useState(380)

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
      console.log(data)
      if ('error' in data) {
        setError(data.error)
        console.error(data.error)
      } else if ('question' in data) {
        setQuestion(data.question)
        setChoices(data.choices)
        setMultiOk(data.multiOk)
        setCounts(data.counts)
      } else if ('counts' in data) {
        setCounts(data.counts)
      }
      setLoading(false)
    })

    ws.addEventListener('close', event => {
      if (event.reason === 'component unmounting') {
        return
      }
      console.debug('WebSocket closed', event)
      wsRef.current = new WebSocket(getWorkerSocketOrigin() + '/api/socket/' + id)
      setResetWsListeners(true)
    })

    ws.addEventListener('error', event => {
      console.debug('WebSocket errored', event)
      wsRef.current = new WebSocket(getWorkerSocketOrigin() + '/api/socket/' + id)
      setResetWsListeners(true)
    })

    setResetWsListeners(false)
  }, [id, resetWsListeners])

  const handleResize = () => {
    setChartWidth(textRef.current?.clientWidth || 380)
  }

  useEffect(() => {
    window.addEventListener('resize', handleResize)
    handleResize()
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  return <>
    <Head>
      <title>{question || 'Poll'} - UDIA</title>
    </Head>
    <Container>
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
              layout='vertical'
              barCategoryGap={1}
              width={chartWidth}
              height={400}
              data={counts}
            >
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis type='number' />
              <YAxis type='category' width={150} dataKey='name' />
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
      <Text ref={textRef}>Polls will be removed 24 hours after creation. Source code is available at <Link isExternal href='https://github.com/awwong1/poll.udia.ca'>https://github.com/awwong1/poll.udia.ca</Link></Text>
    </Container>
  </>
}

export default Poll
