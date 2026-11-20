// アクター: 利用者か AI か。読む所は isAI・isUser を通し、外から来る形は actorOfWire でアクターにする
import { expect, test } from "bun:test"
import {
  AI,
  AI_VISITOR,
  actorOfWire,
  canAct,
  isAI,
  isUser,
  isVisitor,
  USER,
  workroomOfActor,
} from "../../web/src/core/actor"

test("利用者と AI は別のアクターで、isAI・isUser が答える", () => {
  expect([isAI(USER), isUser(USER)]).toEqual([false, true])
  expect([isAI(AI), isUser(AI)]).toEqual([true, false])
})

test('外から来た印は、"ai" なら AI、無ければ利用者', () => {
  expect(canAct(actorOfWire({ kind: "ai", workroom: "w1" }))).toBe(true)
  expect(actorOfWire({ kind: "ai", workroom: "w1" })).toEqual({ kind: "ai", workroom: { id: "w1" } })
  expect(isAI(actorOfWire({ kind: "ai" })) && !canAct(actorOfWire({ kind: "ai" }))).toBe(true)
  expect(isUser(actorOfWire(undefined))).toBe(true)
})

test("ビジターは as が visitor の印から来る（ワークルームの id が一緒にあっても as が勝つ）。書けず、入っているワークルームも無い", () => {
  expect(actorOfWire({ kind: "ai", as: "visitor" })).toEqual(AI_VISITOR)
  expect(actorOfWire({ kind: "ai", workroom: "w1", as: "visitor" })).toEqual(AI_VISITOR)
  expect([canAct(AI_VISITOR), isVisitor(AI_VISITOR), workroomOfActor(AI_VISITOR)]).toEqual([false, true, undefined])
  expect([canAct(AI), isVisitor(AI), workroomOfActor(AI)]).toEqual([true, false, "room"])
  expect([canAct(USER), isVisitor(USER), workroomOfActor(USER)]).toEqual([true, false, undefined])
})
