import React, {useEffect, useState, useCallback, useRef, useImperativeHandle} from "react";
import styled from "styled-components";
import BaiduMapConfig from "@/config/baidu-map-config";
//@ts-ignore
import BMap from 'BMap';
import echarts from 'echarts/lib/echarts';
import 'echarts/lib/chart/heatmap';
import {RootStateOrAny, useSelector} from 'react-redux'
import HouseApi from "@apis/house";
import {message} from "antd";
import LocationPng from "../../assets/img/location.png";
import {PageHeaderWrapper} from '@ant-design/pro-layout';

// 地图对象
let map:any = null;
// 区域标签
let regionLabels:any = [];
let OverlapLabels:any = [];

let regionList_v:any = null;
let aggData_v:any = null;
/**
 * 地图容器
 */
const MapContainer = ({onBoundsChange, childRef, houseList}) => {


    const city = useSelector((state:RootStateOrAny) => state.common.city);

    const [locationPng, setLocationPng] = useState();

    const [houseListLayerStore, setHouseListLayerStore] = useState<any>([]);

    useEffect(() => {
        if(city.enName){
            map = new BMap.Map("map-search-house", {enableMapClick:false, minZoom: 11,maxZoom: 18}); // 创建Map实例
            //map.setMapStyle({style:'normal'});

            map.setCurrentCity(city.cnName);
            map.enableScrollWheelZoom(true);
            map.centerAndZoom(new BMap.Point(city.baiduMapLng, city.baiduMapLat), 11);  // 初始化地图,设置中心点坐标和地图级别
            getAggregationRegions(city.enName);
            map.addEventListener("dragend", handleBoundsChange);
            map.addEventListener("zoomend", handleBoundsChange);
        }
    }, [city.enName]);

    useImperativeHandle(childRef, () => ({
        zoomToPoint: (title, longiitude, latitude ) => {
            if(locationPng){
                map.removeOverlay(locationPng);
            }
            const point = new BMap.Point(longiitude, latitude);
            const locationIcon = new BMap.Icon(LocationPng, new BMap.Size(30, 40), {});
            const pointerMarker = new BMap.Marker(point,  {icon: locationIcon});
            map.getPanes().markerPane.style.zIndex = 500;
            map.addOverlay(pointerMarker);
            setLocationPng(pointerMarker);
            map.centerAndZoom(point, 15);
            pointerMarker.addEventListener("click", (e) => {
                map.setZoom(15);
                map.panTo(point);
            })
        }
    }));




    // 根据程序英文名获取聚合区域房源信息
    const getAggregationRegions = (cityEnName) => {
        HouseApi.mapCityHouseAgg(cityEnName).then(res => {
            if (res){
                drawNewRegion(res.regions, res.aggData);
                regionList_v = res.regions;
                aggData_v = res.aggData;
            }
        })
    };

    const drawNewRegion = (regionList:any,aggData)=>{
        // 将聚合数据转换成map
        const aggMap = {};
        const polygonContext = {};
        for(let i = 0; i < aggData.length; i++){
            aggMap[aggData[i].region] = aggData[i].count;
        }
        let pointList:any = [];
        for(let i = 0; i < regionList.length; i++){
            const point = new BMap.Point(regionList[i].baiduMapLng, regionList[i].baiduMapLat);
            point.region = regionList[i].enName;
            pointList.push(point);

            //1. set black point
            const label = new BMap.Label('', {
                position: point,
            });
            label.setStyle(regionStyle);


            //2. set background of black point
            const labelBackground = new BMap.Label('', {
                position: point,
            });
            labelBackground.setStyle(regionStyleBackGround);

            labelBackground.setZIndex(2);
            map.addOverlay(labelBackground);
            label.setZIndex(3);
            map.addOverlay(label);

            OverlapLabels.push(label);
            OverlapLabels.push(labelBackground);
        }

       let pixelList =  orderFromInside2Outside(points2Pixels(map, pointList));
        let overlapList = aabb(pixelList,100,50,30);
        let overlapPoints = pixels2Points(map,overlapList);
        let connectionPoints = pixelsConnection2Points(map,overlapList,100,50);

        for(let i = 0; i < overlapPoints.length; i++){
            let point = overlapPoints[i];
            const contentObj = getContentInfoByRegion(point.region,regionList);
            const content = `${contentObj.cnName}<br/>${aggMap[point.region] || 0}套(${contentObj.averagePrice}万)`;
            const labelContent = new BMap.Label(content, {
                position: point,
            });

            labelContent.setStyle(labelContentStyle);
            labelContent.setZIndex(1);
            map.addOverlay(labelContent);
            OverlapLabels.push(labelContent);

            // 添加行政区域覆盖物
            polygonContext[content] = [];
            const boundary = new BMap.Boundary();
            const addPolygon = (content) => {
                boundary.get(city.cnName + contentObj.cnName, res => {
                    const count = res.boundaries.length;
                    if(count === 0){
                        message.error(`${city.cnName}-${contentObj.cnName}边界获取失败`);
                        return;
                    }
                    for(let i = 0; i < count; i++){
                        const ply = new BMap.Polygon(res.boundaries[i], {strokeWeight: 2, strokeColor: "rgba(255, 98, 98, 0.90)", fillOpacity: 0.3, fillColor: "rgba(255, 98, 98, 0.90)"}); //建立多边形覆盖物
                        map.addOverlay(ply);  //添加覆盖物
                        polygonContext[content].push(ply);
                        ply.hide();
                    }
                })
            };
            addPolygon(content);

            // 添加区域的鼠标移入事件(展示地图区域位置)
            labelContent.addEventListener("mouseover", (e) => {
                const boundaries = polygonContext[content] || [];
               // label.setStyle({background: "rgba(255, 98, 98, 0.90)"});
                for(let i = 0; i < boundaries.length; i++){
                    boundaries[i].show();
                }
            });
            // 添加区域鼠标移出事件（隐藏地图区域位置）
            labelContent.addEventListener("mouseout", (e) => {
                const boundaries = polygonContext[content] || [];
               // label.setStyle({background: "#f67d2e"});
                for(let i = 0; i < boundaries.length; i++){
                    boundaries[i].hide();
                }
            });
            // 添加区域鼠标点击事件（点击时视野中心移动到当前店）
            labelContent.addEventListener("click", (e) => {
                map.setZoom(14);
                map.panTo(point);
            });
        }

        for(let i = 0; i < connectionPoints.length; i++){
            let point = connectionPoints[i];
            for(let k = 0; k < regionList.length; k++){
                if(regionList[k].enName == point.region){
                    let line = new BMap.Polyline([point,
                            new BMap.Point(regionList[k].baiduMapLng, regionList[k].baiduMapLat)],
                        {strokeColor:"#344c47", strokeWeight:2, strokeOpacity:0.8, strokeStyle:"dashed"});
                    map.addOverlay(line);

                    OverlapLabels.push(line);

                }
            }
        }

    }

    const getContentInfoByRegion = (region, regionList)=>{
        let content = {cnName:'', averagePrice:0};
        for(let i=0; i<regionList.length; i++){
            if(regionList[i].enName == region){
                content.cnName = regionList[i].cnName;
                content.averagePrice = 10;

                if(regionList[i].enName == 'ypq'){
                    content.averagePrice = 8.2;
                }else if(regionList[i].enName == 'mhq'){
                    content.averagePrice = 6.7;
                }else if(regionList[i].enName == 'xhq'){
                    content.averagePrice = 9.3;
                }else if(regionList[i].enName == 'hkq'){
                    content.averagePrice = 8.3;
                }else if(regionList[i].enName == 'ptq'){
                    content.averagePrice = 8.1;
                }else if(regionList[i].enName == 'cnq'){
                    content.averagePrice = 9.1;
                }else if(regionList[i].enName == 'jaq'){
                    content.averagePrice = 9;
                }else if(regionList[i].enName == 'hpq'){
                    content.averagePrice = 11.4;
                }else if(regionList[i].enName == 'cmq'){
                    content.averagePrice = 1.9;
                }else if(regionList[i].enName == 'sjq'){
                    content.averagePrice = 4.8;
                }else if(regionList[i].enName == 'fxq'){
                    content.averagePrice = 2.5;
                }else if(regionList[i].enName == 'jsq'){
                    content.averagePrice = 2;
                }else if(regionList[i].enName == 'jdq'){
                    content.averagePrice = 4.4;
                }else if(regionList[i].enName == 'bsq'){
                    content.averagePrice = 5.3;
                }else if(regionList[i].enName == 'qpq'){
                    content.averagePrice = 5.1;
                }

                break;
            }
        }

        return content;
    }

    // 绘制区域信息
    const drawRegion = (regionList: any, aggData) => {
        // 将聚合数据转换成map
        const aggMap = {};
        const polygonContext = {};
        for(let i = 0; i < aggData.length; i++){
            aggMap[aggData[i].region] = aggData[i].count;
        }
        for(let i = 0; i < regionList.length; i++){
            let averagePrice = 0;
            const point = new BMap.Point(regionList[i].baiduMapLng, regionList[i].baiduMapLat);

            //1. set black point
            const label = new BMap.Label('', {
                position: point,
            });
            label.setStyle(regionStyle);


            //2. set background of black point
            const labelBackground = new BMap.Label('', {
                position: point,
            });
            labelBackground.setStyle(regionStyleBackGround);


            //3. set label content


            labelContentStyle.margin = "-25px 0 0 -50px";
            labelContentStyle.border = "2px solid #d57b00";
            let line = null;
            if(regionList[i].enName == 'ypq'){
                labelContentStyle.margin = "-125px 0 0 15px";
                line = new BMap.Polyline([point,

                    new BMap.Point(regionList[i].baiduMapLng+0.075, regionList[i].baiduMapLat+0.075)],
                    {strokeColor:"#344c47", strokeWeight:2, strokeOpacity:0.8, strokeStyle:"dashed"});
                averagePrice = 8.2;
            }else if(regionList[i].enName == 'mhq'){
                labelContentStyle.margin = "50px 0 0 -50px";
                line = new BMap.Polyline([point,

                        new BMap.Point(regionList[i].baiduMapLng, regionList[i].baiduMapLat-0.075)],
                    {strokeColor:"#344c47", strokeWeight:2, strokeOpacity:0.8, strokeStyle:"dashed"});
                averagePrice = 6.7;
            }else if(regionList[i].enName == 'xhq'){
                labelContentStyle.margin = "50px 0 0 60px";
                line = new BMap.Polyline([point,

                        new BMap.Point(regionList[i].baiduMapLng+0.125, regionList[i].baiduMapLat-0.055)],
                    {strokeColor:"#344c47", strokeWeight:2, strokeOpacity:0.8, strokeStyle:"dashed"});
                averagePrice = 9.3;
            }else if(regionList[i].enName == 'hkq'){
                labelContentStyle.margin = "-25px 0 0 70px";
                line = new BMap.Polyline([point,
                        new BMap.Point(regionList[i].baiduMapLng+0.080, regionList[i].baiduMapLat)],
                    {strokeColor:"#344c47", strokeWeight:2, strokeOpacity:0.8, strokeStyle:"dashed"});
                averagePrice = 8.3;
            }else if(regionList[i].enName == 'ptq'){
                labelContentStyle.margin = "-25px 0 0 -230px";
                line = new BMap.Polyline([point,
                        new BMap.Point(regionList[i].baiduMapLng-0.155, regionList[i].baiduMapLat)],
                    {strokeColor:"#344c47", strokeWeight:2, strokeOpacity:0.8, strokeStyle:"dashed"});
                averagePrice = 8.1;
            }else if(regionList[i].enName == 'cnq'){
                labelContentStyle.margin = "25px 0 0 -130px";
                line = new BMap.Polyline([point,
                        new BMap.Point(regionList[i].baiduMapLng-0.034, regionList[i].baiduMapLat-0.040)],
                    {strokeColor:"#344c47", strokeWeight:2, strokeOpacity:0.8, strokeStyle:"dashed"});
                averagePrice = 9.1;
            }else if(regionList[i].enName == 'jaq'){
                labelContentStyle.margin = "-75px 0 0 -80px";
                line = new BMap.Polyline([point,
                        new BMap.Point(regionList[i].baiduMapLng-0.065, regionList[i].baiduMapLat+0.055)],
                    {strokeColor:"#344c47", strokeWeight:2, strokeOpacity:0.8, strokeStyle:"dashed"});
                averagePrice = 9;
            }else if(regionList[i].enName == 'hpq'){
               //  labelContentStyle.margin = "0px 0 0 30px";
               // labelContentStyle.border = "3px solid #F4FC00";
               //  line = new BMap.Polyline([point,
               //          new BMap.Point(regionList[i].baiduMapLng+0.035, regionList[i].baiduMapLat-0.025)],
               //      {strokeColor:"#344c47", strokeWeight:2, strokeOpacity:0.8, strokeStyle:"dashed"});
                averagePrice = 11.4;
            }else if(regionList[i].enName == 'cmq'){
                averagePrice = 1.9;
            }else if(regionList[i].enName == 'sjq'){
                averagePrice = 4.8;
            }else if(regionList[i].enName == 'fxq'){
                averagePrice = 2.5;
            }else if(regionList[i].enName == 'jsq'){
                averagePrice = 2;
            }else if(regionList[i].enName == 'jdq'){
                averagePrice = 4.4;
            }else if(regionList[i].enName == 'bsq'){
                averagePrice = 5.3;
            }else if(regionList[i].enName == 'qpq'){
                averagePrice = 5.1;
            }
            const content = `${regionList[i].cnName}<br/>${aggMap[regionList[i].enName] || 0}套(${averagePrice}万)`;

            const labelContent = new BMap.Label(content, {
                position: point,
            });

            labelContent.setStyle(labelContentStyle);



            if(line){
                map.addOverlay(line);
            }
            labelBackground.setZIndex(2);
            map.addOverlay(labelBackground);
            label.setZIndex(3);
            map.addOverlay(label);
            labelContent.setZIndex(1);
            map.addOverlay(labelContent);
            //4. draw lines

            // 添加行政区域覆盖物
            polygonContext[content] = [];
            const boundary = new BMap.Boundary();
            const addPolygon = (content) => {
                boundary.get(city.cnName + regionList[i].cnName, res => {
                    const count = res.boundaries.length;
                    if(count === 0){
                        message.error(`${city.cnName}-${regionList[i].cnName}边界获取失败`);
                        return;
                    }
                    for(let i = 0; i < count; i++){
                        const ply = new BMap.Polygon(res.boundaries[i], {strokeWeight: 2, strokeColor: "rgba(255, 98, 98, 0.90)", fillOpacity: 0.3, fillColor: "rgba(255, 98, 98, 0.90)"}); //建立多边形覆盖物
                        map.addOverlay(ply);  //添加覆盖物
                        polygonContext[content].push(ply);
                        ply.hide();
                    }
                })
            };
            addPolygon(content);

            // 添加区域的鼠标移入事件(展示地图区域位置)
            labelContent.addEventListener("mouseover", (e) => {
                const boundaries = polygonContext[content] || [];
                label.setStyle({background: "rgba(255, 98, 98, 0.90)"});
                for(let i = 0; i < boundaries.length; i++){
                    boundaries[i].show();
                }
            });
            // 添加区域鼠标移出事件（隐藏地图区域位置）
            labelContent.addEventListener("mouseout", (e) => {
                const boundaries = polygonContext[content] || [];
                label.setStyle({background: "#f67d2e"});
                for(let i = 0; i < boundaries.length; i++){
                    boundaries[i].hide();
                }
            });
            // 添加区域鼠标点击事件（点击时视野中心移动到当前店）
            labelContent.addEventListener("click", (e) => {
               map.setZoom(14);
               map.panTo(point);
            });
            // 将labels存入自定义变量中
            regionLabels.push(label);
        }
        // 创建百度云麻点
        // const customLayer=new BMap.CustomLayer(BaiduMapConfig.geoTableId); //新建麻点图图层对象
    };

    //百度经纬度坐标集合转换为像素坐标集合
    const points2Pixels = (map, pointList)=>{
        let pixelList:any = [];
        for(let i = 0; i < pointList.length; i++){
            let pixel = map.pointToPixel(pointList[i]);
            pixel.region = pointList[i].region;
            pixelList.push(pixel);
        }

        return pixelList;
    }

    const pixels2Points = (map, pixelList)=>{
        let pointList:any = [];
        for(let i = 0; i < pixelList.length; i++){

            let point = map.pixelToPoint({x:pixelList[i].x1, y:pixelList[i].y1});
            point.region = pixelList[i].region;
            pointList.push(point);
        }

        return pointList;
    }

    const pixelsConnection2Points = (map, pixelList,width,height)=>{
        let pointList:any = [];
        for(let i = 0; i < pixelList.length; i++){

            let point = map.pixelToPoint({x:pixelList[i].x1+width/2, y:pixelList[i].y1+height/2});
            point.region = pixelList[i].region;
            pointList.push(point);
        }

        return pointList;
    }

    //像素锁表中间到外围排序
    const orderFromInside2Outside = (pixelList)=>{
        let pixelListWithOrder:any = [];
        let minX = 0;
        let minY = 0;
        let maxX = 0;
        let maxY = 0;
        for(let i = 0; i < pixelList.length; i++){
            let currentX = pixelList[i].x;
            let currentY = pixelList[i].y;

            if(currentX<minX){minX = currentX;}
            if(currentY<minY){minY = currentY;}
            if(currentX>maxX){maxX = currentX;}
            if(currentY>maxY){maxY = currentY;}
        }

        let newCenter_x = (minX + maxX)/2;
        let newCenter_y = (minY + maxY)/2;

        for(let i = 0; i < pixelList.length; i++){
            let currentX = pixelList[i].x;
            let currentY = pixelList[i].y;

            let distancePower2Center = Math.pow(currentX - newCenter_x,2) + Math.pow(currentY - newCenter_y, 2);

            pixelListWithOrder.push({distancePower:distancePower2Center, x:currentX, y:currentY,region:pixelList[i].region});

            if(pixelListWithOrder.length >=2){
                for(let i = pixelListWithOrder.length-1; i > 0; i--){
                    let p1 = pixelListWithOrder[i];
                    let p2 = pixelListWithOrder[i-1];

                    if(p1.distancePower < p2.distancePower){
                        let temp = p1;
                        pixelListWithOrder[i] = p2;
                        pixelListWithOrder[i-1] = temp;
                    }else{
                        break;
                    }
                }
            }

        }

    return pixelListWithOrder;
    }


    const aabb = (pixelListWithOrder, overlap_width, overlap_height,offset)=>{
        let overlapSet:any = [];
        for(let i =0; i< pixelListWithOrder.length; i++){
            console.log(pixelListWithOrder[i].region);
            let new_x = pixelListWithOrder[i].x - overlap_width/2;
            let new_y = pixelListWithOrder[i].y - overlap_height/2;
            pixelListWithOrder[i].x1 = pixelListWithOrder[i].x;
            pixelListWithOrder[i].y1 = pixelListWithOrder[i].y;
            let aabb_count = 0;
            while(aabbWithOriginalSet(pixelListWithOrder, pixelListWithOrder[i],overlap_width, overlap_height) || aabbWithOverlapSet(overlapSet, pixelListWithOrder[i],overlap_width, overlap_height)){
                console.log("*************************************************");
                if(aabb_count%8 == 0){ //move up
                    new_x = new_x ;
                    new_y = new_y - (aabb_count/8+1)*overlap_height - offset;

                    console.log(aabb_count+ " -- ("+new_x + "," + new_y + ")");
                }else if(aabb_count%8 == 1){ //move down
                    new_x = new_x;
                    new_y = new_y+ 2*(aabb_count/8+1)*overlap_height + offset;
                    console.log(aabb_count+ " -- ("+new_x + "," + new_y + ")");
                }else if(aabb_count%8 == 2){ // move left
                    new_x = new_x - (aabb_count/8+1)*overlap_width ;
                    new_y = new_y - (aabb_count/8+1)*overlap_height ;
                    console.log(aabb_count+ " -- ("+new_x + "," + new_y + ")");
                }else if(aabb_count%8 == 3){ // move right
                    new_x = new_x + 2*(aabb_count/8+1)*overlap_width ;
                    new_y = new_y ;
                    console.log(aabb_count+ " -- ("+new_x + "," + new_y + ")");
                }else if(aabb_count%8 == 4){
                    new_x = new_x;
                    new_y = new_y - (aabb_count/8+1)*overlap_height - offset;
                    console.log(aabb_count+ " -- ("+new_x + "," + new_y + ")");
                }else if(aabb_count%8 == 5){
                    new_x = new_x  ;
                    new_y = new_y + 2*(aabb_count/8+1)*overlap_height + offset;
                    console.log(aabb_count+ " -- ("+new_x + "," + new_y + ")");
                }else if(aabb_count%8 == 6){
                    new_x = new_x - 2*(aabb_count/8+1)*overlap_width ;
                    new_y = new_y;
                    console.log(aabb_count+ " -- ("+new_x + "," + new_y + ")");
                }else if(aabb_count%8 == 7){
                    new_x = new_x  ;
                    new_y = new_y- 2*(aabb_count/8+1)*overlap_height - offset;
                    console.log(aabb_count+ " -- ("+new_x + "," + new_y + ")");
                }

                aabb_count = aabb_count + 1;
                pixelListWithOrder[i].x1 = new_x;
                pixelListWithOrder[i].y1 = new_y;
            }



            overlapSet.push({x0:pixelListWithOrder[i].x, y0:pixelListWithOrder[i].y, x1:new_x, y1:new_y,region:pixelListWithOrder[i].region});

        }

        return overlapSet;
    }

    const aabbWithOriginalSet = (pixelListWithOrder, currentOverlay,overlap_width, overlap_height)=>{
        let new_x = currentOverlay.x1;
        let new_y = currentOverlay.y1;
        for(let i =0; i< pixelListWithOrder.length; i++){

            if(pixelListWithOrder[i].x>=new_x && pixelListWithOrder[i].x<=new_x + overlap_width && pixelListWithOrder[i].y>= new_y && pixelListWithOrder[i].y <= new_y+overlap_height){
               return true;
           }
        }

        return false;
    }

    const aabbWithOverlapSet =(overlapSet, currentOverlay,overlap_width, overlap_height) =>{
        let new_x = currentOverlay.x1;
        let new_y = currentOverlay.y1;
        for(let i =0; i< overlapSet.length; i++){

            if((new_x >= overlapSet[i].x1 && new_x <= overlapSet[i].x1 + overlap_width && new_y >= overlapSet[i].y1 && new_y <= overlapSet[i].y1+overlap_height)
                ||
                (new_x+overlap_width >= overlapSet[i].x1 && new_x+overlap_width <= overlapSet[i].x1 + overlap_width && new_y >= overlapSet[i].y1 && new_y <= overlapSet[i].y1+overlap_height)
               ||
                (new_x >= overlapSet[i].x1 && new_x <= overlapSet[i].x1 + overlap_width && new_y+overlap_height  >= overlapSet[i].y1 && new_y+overlap_height  <= overlapSet[i].y1+overlap_height)
                ||
                (new_x+overlap_width >= overlapSet[i].x1 && new_x+overlap_width <= overlapSet[i].x1 + overlap_width && new_y+overlap_height  >= overlapSet[i].y1 && new_y+overlap_height  <= overlapSet[i].y1+overlap_height)

            )
            {
                return true;
            }
        }

        return false;
    }

    // 地图缩放处理
    const handleBoundsChange = (e) => {
        const bounds = map.getBounds();
        // 西南
        const southWest = bounds.getSouthWest();
        // 东北
        const northEast = bounds.getNorthEast();
        const zoomLevel = map.getZoom();
        const boundsParam = {
            leftTopLongitude: southWest.lng,
            leftTopLatitude: northEast.lat,
            rightBottomLongitude: northEast.lng,
            rightBottomLatitude: southWest.lat,
        };
        // 小于13
        if(zoomLevel < 13){
            // 边界为空
            regionLabels.forEach(item => {
                item.show();
            });
            OverlapLabels.forEach(item => {
                //item.show();
                map.removeOverlay(item);
            });

           drawNewRegion(regionList_v,aggData_v);
        }else{
            // 转换成 左上和右下的坐标
            regionLabels.forEach(item => {
                item.hide();
            });
            OverlapLabels.forEach(item => {
                item.hide();
            });
            // 绘制房源麻点
        }
        onBoundsChange(zoomLevel, boundsParam);
    };

    useEffect(() => {
        if(map){
            houseListLayerStore.forEach(overlay => {
                map.removeOverlay(overlay);
            });
            if(map.getZoom() >= 13){
                drawHousePoint(houseList);
            }
        }
    }, [houseList]);

    // 绘制房源点
    const drawHousePoint = (list) => {
        const tmp:any = [];
        list.forEach((house: any) => {
            if(house.location){
                const point = new BMap.Point(house.location?.lon, house.location?.lat);
                const content = `<div class="house-marker-content"><span class="title">${house.title}</span><span>￥${house.price} 万</span> <b/></div>`;
                const label = new BMap.Label(content, {
                    position: point,
                });
                label.setStyle(houseMarkerStyle);
                tmp.push(label);
                map.addOverlay(label);
            }
        });
        setHouseListLayerStore(tmp);
    };

    // 计算热力图点
    const getPoints = (list) => {
        var points:any = [];
        list.forEach((house: any) => {
            if(house.location){
                points.push({"lng":house.location?.lon, "lat":house.location?.lat,"price":house.price});
            }
        });

        return points;
    };

    // 经纬度转像素坐标
    const getPixel = (lng, lat, zoom)=>{


    };

    return (
        <Container>
            <div id="map-search-house" className="map-search-house"/>
        </Container>
    )
};

const Container = styled.div`
    flex: 1;
    height: 100%;
    .map-search-house{
        height: 100%;
    }
      .BMap_cpyCtrl.BMap_noprint.anchorBL{
        display:none;
     }
     
     .anchorBL a{
        display:none;
     }
    .region-title{
        margin-top: 25px;
        height: 26px;
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
    }
    .house-number{
        font-size: 14px;
    }
    .BMapLabel{
        &:hover{
            z-index: 99 !important;
        }   
    }
    .house-marker-content {
        padding: 0 10px;
        position: relative;
        z-index: 2;
        white-space: nowrap;
        min-width: 60px;
        color: #FFFFFF;
        font-size: 12px;
        box-shadow: 0 1px 4px 0 rgba(0, 0, 0, 0.20);
        z-index:  9 !important;
        cursor: pointer;
        border: 0px solid rgb(255, 0, 0);
        background: #f67d2e;
        display: flex;
        height: 27px;
        line-height: 27px;
        .title{
            display: inline-block;
            max-width: 120px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
   
        b{
            border: 6px solid transparent;
            border-top-color: #f67d2e;
            border-top-width: 8px;
            display: block;
            width: 0;
            height: 0;
            position: absolute;
            left: 20px;
            top: 25px;
        }
        &:hover{
            background: rgba(255, 98, 98, 0.90);
            b{
                 border-top-color: rgba(255, 98, 98, 0.90);
            }
        }
    }
    

`;
const houseMarkerStyle = {
    border: "0px solid rgb(255, 0, 0)",
    backgroundColor: "rgba(255, 255, 255, 0)"
};
const regionStyle = {
    zIndex: 99,
    background: "#d57b00",
    boxShadow: "0 0 8px 0 rgba(0, 0, 0, 0.10)",
    width: "10px",
    height:" 10px",
    border: "0px solid rgb(255, 0, 0)",
    borderRadius: "50%",
    textAlign: "center",
    fontSize:" 16px",
    color: "#FFFFFF",
    margin: "-5px 0 0 -5px",
    cursor: "pointer",
    opacity:"0.8"
};

const regionStyleBackGround = {
    zIndex: 1,
    background: "#d57b00",
    boxShadow: "0 0 8px 0 rgba(0, 0, 0, 0.10)",
    width: "26px",
    height:" 26px",
    border: "0px solid rgb(0, 0, 0)",
    borderRadius: "50%",
    textAlign: "center",
    fontSize:" 16px",
    color: "#FFFFFF",
    margin: "-13px 0 0 -13px",
    cursor: "pointer",
    animation: "shaking 2s linear infinite"
//opacity:"0.5"


};

const labelContentStyle = {
    zIndex: 1,
    background: "#d57b00",
    boxShadow: "0 0 8px 0 rgba(0, 0, 0, 0.10)",
    width: "100px",
    height:" 50px",
    border: "0px solid #00933b",
    borderRadius: "0%",
    textAlign: "center",
    fontSize:" 14px",
    color: "#FFFFFF",
    margin: "0px 0 0 0px",
    cursor: "pointer",
    //opacity:"0.9"

};



export default  React.memo(MapContainer);
