"use client";

import { useId, useState } from "react";

const consentItems = [
  { id: "provider", title: "모델 전송", description: "가명처리된 입력을 현재 안내된 평가 모델로 전송합니다." },
  { id: "history", title: "가명처리와 이력", description: "인증 사용자의 완료된 평가만 삭제 가능한 이력으로 저장합니다." },
  { id: "retention", title: "보관과 삭제", description: "보관 기간과 개별·계정 삭제 절차를 확인했습니다." },
  { id: "benchmark", title: "내부 벤치마크 정책", description: "별도 비식별 검사를 통과한 인증 평가만 익명 내부 보정에 사용될 수 있습니다." }
];

export function ConsentControl() {
  const prefix = useId();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const allChecked = consentItems.every((item) => checked[item.id]);

  function toggleAll(next: boolean) {
    setChecked(Object.fromEntries(consentItems.map((item) => [item.id, next])));
  }

  return (
    <fieldset className="bomti-stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="bomti-field__label">필수 동의</legend>
      <div className="bomti-consent">
        <label htmlFor={`${prefix}-all`}>
          <input id={`${prefix}-all`} type="checkbox" checked={allChecked} onChange={(event) => toggleAll(event.target.checked)} />
          <span><span className="bomti-consent__title">모두 동의</span><span className="bomti-consent__description">아래 항목을 한 번에 선택합니다. 언제든 개별 항목을 해제할 수 있습니다.</span></span>
        </label>
      </div>
      <div>
        {consentItems.map((item) => (
          <div className="bomti-consent" key={item.id}>
            <label htmlFor={`${prefix}-${item.id}`}>
              <input
                id={`${prefix}-${item.id}`}
                type="checkbox"
                checked={Boolean(checked[item.id])}
                onChange={(event) => setChecked((current) => ({ ...current, [item.id]: event.target.checked }))}
              />
              <span><span className="bomti-consent__title">{item.title}</span><span className="bomti-consent__description">{item.description}</span></span>
            </label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
