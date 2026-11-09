// 자동 생성 — 직접 고치지 마세요. promo-engine/src/types.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
// 프로모션 추천 엔진의 데이터 계약. Node 타입 제거 실행을 위해 enum·namespace 없이 작성한다.

                                          
                                                                            
                                                        

/** 고객 여정 단계별 목적: 첫 방문 유인 → 첫 재방문 전환 → 단골화 → 유지·복귀 */
                                                                      
export const OBJECTIVES              = ['acquire', 'convert', 'loyalize', 'retain'];
export const OBJECTIVE_LABEL                            = {
  acquire: '첫 방문 유인',
  convert: '첫 재방문 전환',
  loyalize: '단골 만들기',
  retain: '유지·이탈 방지',
};

/** 고객이 행동하지 못하게 막는 심리적 장벽 */
                     
                                                                              
                                                                       
                                                                               
                                  

export const BARRIER_LABEL                          = {
  perceivedRisk: '결과 불확실성(지각된 위험)',
  physicalAnxiety: '통증·피부·위생 불안',
  socialAnxiety: '민망함·낯섦',
  priceSensitivity: '가격 부담',
  switchingCost: '기존 샵 고착(현상유지 편향)',
  lowAwareness: '인지·신뢰 신호 부족',
  procrastination: '미루기·계기 부재',
  forgetting: '재방문 시점 망각',
  referencePriceShock: '할인 절벽(정가 저항)',
  dealSeeking: '쿠폰 헌터 성향',
  weakCommitment: '습관·약속 부재',
  varietySeeking: '다른 샵 탐색 성향',
  payPain: '매회 지불 고통',
  dissatisfaction: '말하지 않은 불만',
};
export const BARRIERS = Object.keys(BARRIER_LABEL)             ;

/** 혜택을 받는 고객군. prospect만 '신규 고객 증가율', 나머지는 '전환확률 %p'로 효과를 잰다. */
                                                                                             
/** 장치 효과를 셀 때의 단위 문구 */
export const SUCCESS_LABEL                          = {
  prospect: '명 신규', firstTimer: '명 재방문', repeat: '명 단골 전환', regular: '명 이탈 방지', atRisk: '명 복귀', lapsed: '명 복귀',
};
                                                                    
                                                                                                          

                        
                  
              
              
               
                                       
                   
                                       
                               
                                     
                   
                                                                                       
                                               
                                    
                  
                                         
                      
                                                           
                
 

                        
                                  
                                     
                                     
                                        
 

                                  
             
               
                  
                                                 
                                             
                       
                                
                   
                   
               
                                             
                     
               
                        
                                                                       
                                                                                                                                     
              
                                                   
                                                           
                                                         
                                                     
                        
                       
                           
    
                       
                                          
               
 

                                
                      
                                        
                          
                                     
                      
                         
                                
                       
                                 
                      
                          
                         
                     
                                 
                                     
                                    
                                        
                     
 

                                   
                      
                              
                         
                                                   
                         
                      
                                       
                       
 

                                 
                  
                      
                 
                        
                                                                                       
                                               
                                                                       
                                                           
                 
 

                               
             
               
                             
                       
                               
                        
                            
                                        
                                             
                     
                     
                           
                      
                       
                       
                      
                 
                    
                    
                                 
                           
                            
                                         
                           
                             
                               
                            
                             
                        
             
                
                                 
                                                  
                                        
 

                                
                           
                         
                           
                           
                        
                            
                       
                              
                      
                         
                     
                          
                         
 

                                                                                     
                                                                                                                  

                            
                      
                                   
                                          
                         
                  
 

                             
                
                
                                  
                 
                         
                       
                     
              
                    
 

                            
               
             
                                    
                                        
                     
                      
                    
                
                                  
                                                     
 

                             
                          
                       
              
                
                  
                   
                      
                       
                        
                
                       
                          
                                
                     
                
                    
                     
                                                                                
                                        
                                                                             
 

/** first 기록 없음 / new 새 시도 / rested 쉬었다 다시 / measuring 실행 결과 확인 중 / proven 효과 확인 / weak 효과 약함 / skipped 지난달 미실행 / fatigued 오래 실행 */
                                                                                                                   

                                
             
               
                       
                 
                
              
               
                                   
 

/** 한 달의 추천 기록. 앱이 매달 저장해 다음 달 추천의 입력으로 돌려준다(고객 개인정보 없음) */
                                
                 
                            
                           
                     
 

                                     
                 
                          
                                                                            
                                                                                                   
                                                          
                                                                                                                                      
 

                       
                  
                    
                       
                                               
                         
                                     
                                             
                                                     
                                            
                                                                     
                     
                              
 
