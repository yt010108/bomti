"use client";

import { useId, useState } from "react";

const consentItems = [
  { id: "providerDisclosure", title: "모델 전송 안내", description: "가명처리된 입력을 현재 안내된 평가 모델로 전송하는 내용을 확인합니다." },
  { id: "pseudonymization", title: "가명처리", description: "원문 대신 가명처리된 입력으로 평가하며 원문은 평가 이력에 저장하지 않습니다." },
  { id: "retention", title: "보관과 삭제", description: "인증 사용자는 완료된 평가 이력을 삭제할 수 있고 계정 삭제를 요청할 수 있습니다." },
  { id: "benchmark", title: "익명 벤치마크 정책", description: "별도 비식별 검토를 통과한 인증 평가만 소유자와 재연결할 수 없는 내부 보정에 사용될 수 있습니다." }
] as const;

export type ConsentValue = Record<(typeof consentItems)[number]["id"], boolean>;

export const emptyConsentValue = (): ConsentValue => ({
  providerDisclosure: false,
  pseudonymization: false,
  retention: false,
  benchmark: false
});

export function ConsentControl({
  value,
  onChange,
  disabled = false
}: {
  value?: ConsentValue;
  onChange?: (value: ConsentValue) => void;
  disabled?: boolean;
}) {
  const prefix = useId();
  const [internalValue, setInternalValue] = useState<ConsentValue>(emptyConsentValue);
  const checked = value ?? internalValue;
  const allChecked = consentItems.every((item) => checked[item.id]);

  function update(next: ConsentValue) {
    if (value === undefined) setInternalValue(next);
    onChange?.(next);
  }

  function toggleAll(next: boolean) {
    update(Object.fromEntries(consentItems.map((item) => [item.id, next])) as ConsentValue);
  }

  return (
    <fieldset className="bomti-stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="bomti-field__label">필수 동의</legend>
      <div className="bomti-consent">
        <label htmlFor={`${prefix}-all`}>
          <input id={`${prefix}-all`} type="checkbox" checked={allChecked} disabled={disabled} onChange={(event) => toggleAll(event.target.checked)} />
          <span><span className="bomti-consent__title">모두 동의</span><span className="bomti-consent__description">아래 네 항목을 한 번에 선택합니다. 개별 항목을 해제하면 모두 동의도 해제됩니다.</span></span>
        </label>
      </div>
      <div>
        {consentItems.map((item) => (
          <div className="bomti-consent" key={item.id}>
            <label htmlFor={`${prefix}-${item.id}`}>
              <input
                id={`${prefix}-${item.id}`}
                type="checkbox"
                checked={checked[item.id]}
                disabled={disabled}
                onChange={(event) => update({ ...checked, [item.id]: event.target.checked })}
              />
              <span><span className="bomti-consent__title">{item.title}</span><span className="bomti-consent__description">{item.description}</span></span>
            </label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
