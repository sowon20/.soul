#!/bin/bash

# Phase P: 프로필 API 테스트 스크립트

API_URL="http://localhost:3000/api/profile/p"
USER_ID="sowon"

echo "======================================"
echo "Phase P: 프로필 API 테스트"
echo "======================================"
echo ""

# 색상 코드
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 프로필 조회
echo -e "${YELLOW}[1] 프로필 조회 테스트${NC}"
PROFILE_RESPONSE=$(curl -s "$API_URL?userId=$USER_ID")
echo "$PROFILE_RESPONSE" | jq '.'

if echo "$PROFILE_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ 프로필 조회 성공${NC}"
else
  echo -e "${RED}✗ 프로필 조회 실패${NC}"
fi
echo ""

# 2. 프로필 요약 조회
echo -e "${YELLOW}[2] 프로필 요약 조회 테스트 (limited)${NC}"
SUMMARY_RESPONSE=$(curl -s "$API_URL/summary?userId=$USER_ID&scope=limited")
echo "$SUMMARY_RESPONSE" | jq '.'

if echo "$SUMMARY_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ 프로필 요약 조회 성공${NC}"
else
  echo -e "${RED}✗ 프로필 요약 조회 실패${NC}"
fi
echo ""

# 3. 필드 추가 테스트
echo -e "${YELLOW}[3] 필드 추가 테스트${NC}"
FIELD_ADD_RESPONSE=$(curl -s -X POST "$API_URL/fields" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "sowon",
    "label": "좋아하는 음식",
    "value": "파스타, 초밥",
    "type": "tag"
  }')
echo "$FIELD_ADD_RESPONSE" | jq '.'

if echo "$FIELD_ADD_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ 필드 추가 성공${NC}"
  FIELD_ID=$(echo "$FIELD_ADD_RESPONSE" | jq -r '.field.id')
  echo "Field ID: $FIELD_ID"
else
  echo -e "${RED}✗ 필드 추가 실패${NC}"
  FIELD_ID=""
fi
echo ""

# 4. 필드 수정 테스트
if [ -n "$FIELD_ID" ]; then
  echo -e "${YELLOW}[4] 필드 수정 테스트${NC}"
  FIELD_UPDATE_RESPONSE=$(curl -s -X PUT "$API_URL/fields/$FIELD_ID" \
    -H "Content-Type: application/json" \
    -d '{
      "userId": "sowon",
      "value": "파스타, 초밥, 피자"
    }')
  echo "$FIELD_UPDATE_RESPONSE" | jq '.'

  if echo "$FIELD_UPDATE_RESPONSE" | jq -e '.success' > /dev/null; then
    echo -e "${GREEN}✓ 필드 수정 성공${NC}"
  else
    echo -e "${RED}✗ 필드 수정 실패${NC}"
  fi
  echo ""
fi

# 5. 권한 조회 테스트
echo -e "${YELLOW}[5] 권한 조회 테스트${NC}"
PERM_RESPONSE=$(curl -s "$API_URL/permissions?userId=$USER_ID")
echo "$PERM_RESPONSE" | jq '.'

if echo "$PERM_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ 권한 조회 성공${NC}"
else
  echo -e "${RED}✗ 권한 조회 실패${NC}"
fi
echo ""

# 6. 권한 수정 테스트
echo -e "${YELLOW}[6] 권한 수정 테스트${NC}"
PERM_UPDATE_RESPONSE=$(curl -s -X PATCH "$API_URL/permissions" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "sowon",
    "readScope": "limited",
    "canWrite": false,
    "canDelete": false,
    "autoIncludeInContext": true
  }')
echo "$PERM_UPDATE_RESPONSE" | jq '.'

if echo "$PERM_UPDATE_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ 권한 수정 성공${NC}"
else
  echo -e "${RED}✗ 권한 수정 실패${NC}"
fi
echo ""

# 7. 키워드 기반 필드 검색 테스트
echo -e "${YELLOW}[7] 키워드 기반 필드 검색 테스트${NC}"
KEYWORD_RESPONSE=$(curl -s "$API_URL/summary?userId=$USER_ID&keywords=음식,좋아하는")
echo "$KEYWORD_RESPONSE" | jq '.'

if echo "$KEYWORD_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ 키워드 검색 성공${NC}"
else
  echo -e "${RED}✗ 키워드 검색 실패${NC}"
fi
echo ""

# 8. 필드 삭제 테스트 (정리)
if [ -n "$FIELD_ID" ]; then
  echo -e "${YELLOW}[8] 필드 삭제 테스트 (정리)${NC}"
  FIELD_DELETE_RESPONSE=$(curl -s -X DELETE "$API_URL/fields/$FIELD_ID?userId=$USER_ID")
  echo "$FIELD_DELETE_RESPONSE" | jq '.'

  if echo "$FIELD_DELETE_RESPONSE" | jq -e '.success' > /dev/null; then
    echo -e "${GREEN}✓ 필드 삭제 성공${NC}"
  else
    echo -e "${RED}✗ 필드 삭제 실패${NC}"
  fi
  echo ""
fi

echo "======================================"
echo -e "${GREEN}테스트 완료${NC}"
echo "======================================"
